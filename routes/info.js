

'use strict';

var fs = require('fs');
var path = require('path');
var SIS = require('../util/constants');

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var build = null;
    try {
        var buildPath = path.resolve(__dirname, '../build.json');
        build = fs.readFileSync(buildPath, 'utf8');
        build = JSON.parse(build);
    } catch (ex) {
        build = { 'err' : 'no info present' };
    }

    app.get("/api/:version(" + SIS.SUPPORTED_VERSIONS.join("|") + ")/info", function(req, res) {
        res.status(200).json(build);
    });
};
