/************************************************************
 * Copy D2L Publish Settings
 * 
 * This program copies the 'IsHidden' attribute from D2L
 * Courses.  The 'IsHidden' attribute determines whether
 * students are able to view the specific content in the 
 * modules of a D2L course.
 * 
 * Author: Scott Nicholes
 ***********************************************************/

var prompt = require('prompt');
var fs = require('fs');
var request = require('request');
var async = require('async');
var cookieMonster = require('./cookieExtractor');

// Export this module
module.exports = main;

/**
 * This is the main driving function of the program.  
 * First, it will get the settings needed to run the program.
 * Then, it will get the D2L Module data and then format it
 * into objects that will make it easy to copy to a canvas course.
 * 
 * @param {function} callback A Callback function in the form of (error, data) that 
 *                            can have access to the d2L Module Data Output.
 *                            
 * @author Scott Nicholes                           
 */
function main(callback) {
    // Get the data we need from the user
    getSettings(function (error, data) {
        if (error) {
            console.log('There was an error with the prompting process.');
            console.log('Ending program...');
            return;
        }

        // Save the settings to data variables
        var orgUnitId = data.orgUnitId;

        // GET request and then format the d2L Module Data
        getD2lModuleData(orgUnitId, function (error, d2LModuleData) {
            if (error) {
                callback(error, null);
                return;
            }

            // We now have the module data
            callback(null, d2LModuleData);
            return;

            // Uncomment to apply the changes to a canvas course
            //applyChangesToCanvas(d2LModuleData, courseId, accessToken);
        });
    });
}

/**
 * Prompt the user for the orgUnitId needed to access the D2L Course.
 * 
 * @param {function} callback A function that enables the data to be passed
 *                            back to the caller.
 * 
 * @author Scott Nicholes
 */
function getSettings(callback) {
    // Load the settings file
    var settings = fs.readFileSync('auth.json', 'utf8');

    // Parse the settings file
    settings = JSON.parse(settings);

    var settingsPrompt = {
        properties: {
            orgUnitId: {
                description: "Enter D2L Org Unit ID Number to copy from",
                type: "string",
                default: settings.orgUnitId
            }
        }
    }

    // Prompt the user for the orgUnitId
    prompt.start();
    prompt.get(settingsPrompt, function (error, response) {
        if (error) {
            callback(error);
        }

        // Save the responses back to the settings
        settings.orgUnitId = response.orgUnitId;
        fs.writeFileSync('auth.json', JSON.stringify(settings));

        // Send the reponses back to main
        callback(null, response);
    });
}

/**
 * Fetch the D2L Learning Modules and items.  Then, reformat them
 * into a structure that can be easily transferred to a Canvas Course.
 * 
 * @param {string}   orgUnitId      The ID of the D2L Course to copy from
 * @param {function} parentCallback The main callback that will return the formatted
 *                                  D2L Modules and Items.
 *                                  
 * @author Scott Nicholes                                 
 */
function getD2lModuleData(orgUnitId, parentCallback) {
    // Get all the ids of all the modules
    getModuleIds(orgUnitId, function (error, moduleIds) {

        // Get the root modules of the course
        var parentUrl = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/root/`;
        cookieMonster(parentUrl, function (error, response, body) {
            var parsedRootModules = JSON.parse(body);

            // Reformat each root module
            async.map(parsedRootModules, function (parentModule, callback) {
                // Get all the children of the root modules
                getModuleData(orgUnitId, parentModule.Id, function (error, childModules) {
                    if (error) {
                        console.error('There was an error with the parent async.map: ' + error);
                        callback(error, null);
                    }

                    // Iterate through all the child modules of each root module.
                    async.map(childModules, function (childModule, childCallback) {

                        // If this child module is a parent
                        if (childModule.isParent) {

                            // Then get the data for its children and append them on to this child
                            getModuleData(orgUnitId, childModule.id, function (error, moduleMembers) {
                                if (error) {
                                    console.error('There was an error reading the module member\'s data: ' + error);
                                    childCallback(error, null);
                                }

                                // Add on a new attribute to the childModule to hold all the children
                                childModule.children = moduleMembers;

                                childCallback(null, childModule);
                            });
                        } else {
                            // Simply send the child on
                            childCallback(null, childModule);
                        }
                    }, function (error, reformattedChildModules) {
                        if (error) {
                            console.error('There was an error in generating the module data: ' + error);
                            parentCallback(error, null);
                        }

                        // Reformat our root module
                        var reformattedRootModule = {
                            title: parentModule.Title,
                            id: parentModule.Id,
                            isHidden: parentModule.IsHidden,
                            isParent: true,
                            children: reformattedChildModules
                        }

                        // Send the reformatted root module back to the map
                        callback(null, reformattedRootModule);
                    });
                });
            }, function (error, reformattedRootModules) {
                if (error) {
                    callback(error, null);
                }

                // Finally, send back the finished product
                parentCallback(null, reformattedRootModules);
            });
        });
    });
}

/**
 * This function gets all the ids of all the modules in a D2L course.
 * 
 * @param {string}   orgUnitId The ID of the D2L course to access.
 * @param {function} callback  A function to call in order to send back the data.
 *                             
 * @author Scott Nicholes                            
 */
function getModuleIds(orgUnitId, callback) {
    // Perform the GET Request
    var url = `https://byui.brightspace.com/d2l/api/le/1.24/${orgUnitId}/content/toc`;
    cookieMonster(url, function (error, response, body) {
        if (error) {
            console.error('There was an error: ' + error);
            callback(error, null);
        }

        var modules = JSON.parse(body);
        var moduleIds = []

        // Start the recursive function with the array on top
        recursive(modules.Modules);
        // Recursively search through all the objects, gleaning each moduleId
        function recursive(moduleArray) {
            if (moduleArray) {
                moduleArray.forEach(obj => {
                    if (obj.ModuleId) {
                        moduleIds.push(obj.ModuleId)
                    }
                    // Call this function again on the array that is found in here
                    recursive(obj.Modules)
                });
            }
        }

        // Send back the moduleIds
        callback(null, moduleIds);
    });
}

/**
 * This function gets all the memebers of each module it is given.
 * It then reformats each of the modules to show if they are
 * a parent or not, and to conform to the final object.
 * 
 * @param   {string}   orgUnitId The ID of the D2L Course we are accessing
 * @param   {string}   moduleId  The ID of the specific Module we are accessing
 * @param   {function} callback  A function to call in order to send back the data.
 * 
 * @author Scott Nicholes
 */
function getModuleData(orgUnitId, moduleId, callback) {
    // Make an API call to get the members of the module
    var url = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/modules/${moduleId}/structure/`;

    cookieMonster(url, function (error, response, body) {
        var parsedModules = JSON.parse(body);
        var reformattedModules;

        reformattedModules = parsedModules.map(function (currentObj) {
            var keys = Object.keys(currentObj);

            // If the current object has children
            if (keys.includes('Structure')) {
                var reformattedModule = {
                    title: currentObj.Title,
                    id: currentObj.Id,
                    isHidden: currentObj.IsHidden,
                    // Indicate that this module is a parent
                    isParent: true
                }

                return reformattedModule;
            } else {
                var reformattedModule = {
                    title: currentObj.Title,
                    id: currentObj.Id,
                    isHidden: currentObj.IsHidden,
                    // Indicate that this module has no children
                    isParent: false
                }

                return reformattedModule;
            }
        });

        callback(null, reformattedModules);
    });
}