# Copy-Publish-Settings (A part of course-conversion-tool)

This program copies the state of whether the modules and sub-items of each module of a D2L course are visible to students or not.  

Additionally, it reformats the modules into a structure that makes it easy to interpret.

Example Output:
````````````````````
{
    title: 'Lesson 01',
    id: 88888,
    isHidden: false,
    isParent: true,
    children: [<Child Module>, <Child Module>]
}
````````````````````

## Information Needed/Set-up
- Make an auth.json file and place it in your working directory.  The auth.json file should look like this:
````````````````````
{
    "username": "<your username>",
    "password": "<your password>",
    "orgUnitId": "<The ID of the course you are copying from>",
}
````````````````````
- Make sure that your credentials are able to log in to the D2L CCT Portal.
- Run `npm install` to install all the needed dependencies for this program to run successfully.