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

// main
function main(callback) {
    var orgUnitId;
    var courseId;
    var accessToken;

    // Get the data we need from the user
    getDataFromSettings(function (error, data) {
        if (error) {
            console.log('There was an error with the prompting process.');
            console.log('Ending program...');
            return;
        }

        orgUnitId = data.orgUnitId;
        courseId = data.course_id;
        accessToken = data.canvasAccessToken;

        formatModules(orgUnitId, function (error, d2LModuleData) {
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

function getDataFromSettings(callback) {
    // Load the settings file
    var settings = fs.readFileSync('auth.json', 'utf8');

    // Parse the settings file
    settings = JSON.parse(settings);

    // This is the prompt
    var settingsPrompt = {
        properties: {
            orgUnitId: {
                description: "Enter D2L Org Unit ID Number to copy from",
                type: "string",
                default: settings.orgUnitId
            },
            course_id: {
                description: "Enter Canvas Course_Id to apply settings to",
                type: "string",
                default: settings.course_id
            },
            canvasAccessToken: {
                description: "Enter the Canvas Access Token for the course to apply settings to",
                type: "string",
                default: settings.canvasAccessToken
            }
        }
    }


    // Run prompt with the Settings file
    prompt.start();
    prompt.get(settingsPrompt, function (error, response) {
        if (error) {
            callback(error);
        }

        // Save the responses back to the settings
        settings.orgUnitId = response.orgUnitId;
        settings.course_id = response.course_id;
        fs.writeFileSync('auth.json', JSON.stringify(settings));

        // Send the reponses back to main
        callback(null, response);
    });
}

function formatModules(orgUnitId, callback) {
    // Get all the ids of all the modules
    getModuleIds(orgUnitId, function (error, moduleIds) {

        // Get the root modules of the course
        var parentUrl = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/root/`;
        cookieMonster(parentUrl, function (error, response, body) {
            var parsedParentModules = JSON.parse(body);

            // Iterate through all the root modules in order to reformat them into a final object
            async.map(parsedParentModules, function (parentModule, parentCallback) {
                getModuleData(orgUnitId, parentModule.Id, function (error, childModules) {
                    if (error) {
                        console.error('There was an error with the parent async.map: ' + error);
                        parentCallback(error, null);
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
                            callback(error, null);
                        }

                        // Make the format for our final object
                        var reformattedParentModule = {
                            title: parentModule.Title,
                            id: parentModule.Id,
                            isHidden: parentModule.IsHidden,
                            isParent: true,
                            children: reformattedChildModules
                        }

                        parentCallback(null, reformattedParentModule);
                    });
                });
            }, function (error, reformattedParentModules) {
                if (error) {
                    callback(error, null);
                }

                // Finally, send back the finished product
                callback(null, reformattedParentModules);
            });
        });
    });
}

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

        recursive(modules.Modules);
        // Recursively search through all the objects, gleaning each moduleId
        function recursive(moduleArray) {
            if (moduleArray) {
                moduleArray.forEach(obj => {
                    if (obj.ModuleId) {
                        moduleIds.push(obj.ModuleId)
                    }
                    recursive(obj.Modules)
                })
            }
        }

        callback(null, moduleIds);
    });
}

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

function applyChangesToCanvas(d2LModuleData, courseId, accessToken) {
    // First, get all the ids from the Canvas course
    var allItemsUrl = `https://byui.instructure.com/api/v1/courses/${courseId}/modules?include[]=items&per_page=20&access_token=${accessToken}`;
    request.get(allItemsUrl, function (error, response, body) {
        body = JSON.parse(body);

        var canvasSum = 0;
        var d2lSum = 0;
        var moduleObjects = [];
        body.forEach(function (module) {
            var itemIds = [];
            if (!module.name.includes('Lesson')) {
                for (var i = 0; i < module.items.length; i++) {
                    itemIds.push(module.items[i].id);
                }
            } else {
                for (var i = 1; i < module.items.length; i++) {
                    itemIds.push(module.items[i].id);
                }
            }
            moduleObject = {
                id: module.id,
                itemIds: itemIds
            }

            canvasSum += itemIds.length;
            moduleObjects.push(moduleObject);
        });
        canvasSum += moduleObjects.length;

        d2LModuleData.forEach(function (d2lModule) {
            d2lModule.children.forEach(function (child) {
                if (child.isParent) {
                    d2lSum += child.children.length;
                }
            });
            d2lSum += d2lModule.children.length;
        })
        d2lSum += d2LModuleData.length;

        console.log('Canvas Sum of Ids: ' + canvasSum);
        console.log('d2l Sum of Ids: ' + d2lSum);
    });

}

main();
