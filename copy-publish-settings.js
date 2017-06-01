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
            console.log('There was an error witht the prompting process.');
            console.log('Ending program...');
            return;
        }

        orgUnitId = data.orgUnitId;
        courseId = data.course_id;

        getModuleData(orgUnitId, function (error, data) {
            if (error) {
                console.error('There was an error retrieving the module data: ' + error);
            }

            console.log(data);
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

        callback(null, response);
    });

    // Save the responses as defaults

    // Send the reponses back to main
}

// getModuleData
function getModuleData(orgUnitId, callback) {
    // Make a GET Request URL with the orgUnitId received
    var url = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/root/`;

    // Perform the GET Request
    cookieMonster(url, function (error, response, body) {
        if (error) {
            console.error('There was an error: ' + error);
            callback(error, null);
        }

        var modules = JSON.parse(body);

        // We will make a new Object for Each of the objects given us
        async.map(modules, function (currentObj, callback) {
            // Call getItemData with each moduleId
            getMemberData(orgUnitId, currentObj.Id, function (error, moduleMembers) {
                if (error) {
                    console.error('There was an error reading the module member\'s data: ' + error);
                    callback(error, null);
                }

                var reformattedModule = {
                    title: currentObj.Title,
                    id: currentObj.Id,
                    isHidden: currentObj.IsHidden,
                    members: moduleMembers
                }

                callback(null, reformattedModule);
            });
        }, function (error, reformattedModules) {
            if (error) {
                console.error('There was an error in generating the module data: ' + error);
                callback(error, null);
            }

            callback(null, reformattedModules);
        });
    });
}

// getItemData
function getMemberData(orgUnitId, moduleId, callback) {
    // Make an API call to get the members of the module
    var url = `https://byui.brightspace.com/d2l/api/le/1.2/${orgUnitId}/content/modules/${moduleId}/structure/`;

    cookieMonster(url, function (error, response, body) {
        var parsedMembers = JSON.parse(body);

        var reformattedMembers = parsedMembers.map(function (currentObj) {
            var reformattedMember = {
                title: currentObj.Title,
                id: currentObj.Id,
                isHidden: currentObj.IsHidden
            }

            return reformattedMember;
        });

        callback(null, reformattedMembers);
    });
}

// applyChangesToCanvas

main();
