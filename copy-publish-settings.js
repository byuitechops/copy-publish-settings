var prompt = require('prompt');
var fs = require('fs');
var request = require('request');
var async = require('async');
var cookieMonster = require('./cookieExtractor');

// main
function main() {
    var orgUnitId;
    var courseId;

    // Get the data we need from the user
    getDataFromSettings(function (error, data) {
        if (error) {
            console.log('There was an error with the prompting process.');
            console.log('Ending program...');
            return;
        }

        orgUnitId = data.orgUnitId;
        courseId = data.course_id;

        formatModules(orgUnitId, function (error, d2LModuleData) {
            if (error) {
                console.error('There was an error retrieving the module data: ' + error);
            }

            applyChangesToCanvas(d2LModuleData);
        });
    });
}

function getDataFromSettings(callback) {
    // Load the settings file
    var settings = fs.readFileSync('copyPublishRunSettings.json', 'utf8');

    // Parse the settings file
    settings = JSON.parse(settings);

    // Run prompt with the Settings file
    prompt.start();
    prompt.get(settings, function (error, response) {
        if (error) {
            callback(error);
        }

        // Save the responses as defaults
        settings.properties.orgUnitId.default = response.orgUnitId;
        settings.properties.course_id.default = response.course_id;
        fs.writeFileSync('copyPublishRunSettings.json', JSON.stringify(settings));

        // Send the reponses back to main
        callback(null, response);
    });
}

function formatModules(orgUnitId, callback) {
    // Get all the ids of all the modules
    var moduleIds = getModuleIds(orgUnitId);

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
}

function getModuleIds(orgUnitId) {
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

        return moduleIds;
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

// applyChangesToCanvas
function applyChangesToCanvas(d2LModuleData) {

}

main();
