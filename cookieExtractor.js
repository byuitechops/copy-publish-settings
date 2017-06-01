var Nightmare = require('nightmare')
var fs = require('fs')
var request = require('request')
var auth = JSON.parse(fs.readFileSync('auth.json', 'utf8'))
var nightmare = Nightmare({
    show: true
})
var cookieJar

function getCookies(callback) {
    nightmare
        .goto('https://byui.brightspace.com/d2l/login?noredirect=true')
        .wait('#password')
        .insert('#userName', auth.username)
        .insert('#password', auth.password)
        .click('#formId div a')
        .wait(() => window.location.pathname == "/d2l/home")
        .cookies.get()
        .then(cookie => {
            cookie = cookie.reduce((obj, elm) => {
                obj[elm.name] = elm;
                return obj
            }, {})
            var cookieJar = request.jar()
            cookieJar.setCookie(request.cookie('d2lSessionVal=' + cookie.d2lSessionVal.value), 'https://byui.brightspace.com')
            cookieJar.setCookie(request.cookie('d2lSecureSessionVal=' + cookie.d2lSecureSessionVal.value), 'https://byui.brightspace.com')
            callback(null, cookieJar)
            return nightmare.end()
        })
        .catch(err => callback(err, null))
}

function call(url, callback) {
    if (!cookieJar) {
        getCookies((err, jar) => {
            if (err) {
                callback(err);
                return
            }
            cookieJar = jar
            doCall()
        })
    } else {
        doCall()
    }

    function doCall() {
        request({
            url: url,
            jar: cookieJar
        }, callback)
    }
}

// Example:
// 
//  call('https://byui.brightspace.com/d2l/api/le/1.2/237861/content/modules/3535941/structure/',(error, response, body) => {
//	  console.log(body)
//  })

module.exports = call
