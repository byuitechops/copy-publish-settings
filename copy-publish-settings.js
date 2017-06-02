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

        formatModules(orgUnitId, function (error, moduleData) {
            if (error) {
                console.error('There was an error retrieving the module data: ' + error);
            }

            console.log(moduleData[1].children);

            /*console.log('length of first dimension: ' + moduleData.length);

            var sum = 0;
            moduleData.forEach(function (module) {
                module.forEach(function (item) {
                    if (item.isParent === true) {
                        sum++;
                    }
                })
            });

            console.log(sum);*/

        });
    });
}

// getDataFromSettings
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

// getModuleData
function formatModules(orgUnitId, callback) {
    // Make a GET Request URL with the orgUnitId received
    //var url = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/root/`;
    var url = `https://byui.brightspace.com/d2l/api/le/1.24/${orgUnitId}/content/toc`;

    // Perform the GET Request
    cookieMonster(url, function (error, response, body) {
        if (error) {
            console.error('There was an error: ' + error);
            callback(error, null);
        }

        var modules = JSON.parse(body);

        var moduleIds = generateModuleIds(modules);

        var parentUrl = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/root/`;

        cookieMonster(parentUrl, function (error, response, body) {
            var parsedParentModules = JSON.parse(body);

            async.map(parsedParentModules, function (parentModule, parentCallback) {
                getModuleData(orgUnitId, parentModule.Id, function (error, childModules) {
                    if (error) {
                        console.error('There was an error with the parent async.map: ' + error);
                        parentCallback(error, null);
                    }

                    // We will make a new Object for Each of the objects given us
                    async.map(childModules, function (childModule, childCallback) {
                        if (childModule.isParent) {
                            getModuleData(orgUnitId, childModule.id, function (error, moduleMembers) {
                                if (error) {
                                    console.error('There was an error reading the module member\'s data: ' + error);
                                    childCallback(error, null);
                                }

                                childModule.children = moduleMembers;

                                childCallback(null, childModule);
                            });
                        } else {
                            childCallback(null, childModule);
                        }
                    }, function (error, reformattedChildModules) {
                        if (error) {
                            console.error('There was an error in generating the module data: ' + error);
                            callback(error, null);
                        }

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

                callback(null, reformattedParentModules);
            });
        });
    });
}

function generateModuleIds(modules) {
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
}

function getModuleData(orgUnitId, moduleId, callback) {
    // Make an API call to get the members of the module
    var url = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/modules/${moduleId}/structure/`;

    cookieMonster(url, function (error, response, body) {
        var parsedModules = JSON.parse(body);
        var reformattedModules;

        reformattedModules = parsedModules.map(function (currentObj) {
            var keys = Object.keys(currentObj);
            if (keys.includes('Structure')) {
                var reformattedModule = {
                    title: currentObj.Title,
                    id: currentObj.Id,
                    isHidden: currentObj.IsHidden,
                    isParent: true
                }

                return reformattedModule;
            } else {
                var reformattedModule = {
                    title: currentObj.Title,
                    id: currentObj.Id,
                    isHidden: currentObj.IsHidden,
                    isParent: false
                }

                return reformattedModule;
            }
        });

        callback(null, reformattedModules);
    });
}

// applyChangesToCanvas

main();
