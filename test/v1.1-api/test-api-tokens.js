describe('@API @V1.1API - Authorization API Tokens', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');
    var AuthFixture = require("../fixtures/authdata");

    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(err) {
            if (err) {
                console.log(err);
                return done(err);
            }
            // issue create requests
            var creds = ApiServer.getSuperCreds();
            ApiServer.getTempToken(creds.username, creds.password,
            function(e, t) {
                if (e) {
                    console.log(e);
                    return done(e);
                }
                var token = t.name;
                var users = AuthFixture.createUsers();
                AuthFixture.initUsers(ApiServer, token, users, done);
            });
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    var users = AuthFixture.createUsers();
    var userNames = Object.keys(users);
    var userToTokens = { };

    describe("create tokens", function() {
        userNames.forEach(function(name) {
            var testName = "should create tokens for " + name;
            it(testName, function(done) {
                // first token is a temp token
                var user = users[name];
                ApiServer.getTempToken(name, name, function(err, token) {
                    if (err) {
                        console.log(err);
                    }
                    should.not.exist(err);
                    should.exist(token);
                    name.should.eql(token.username);
                    token.should.have.property('expires');
                    // now use the token to create a persistent token
                    var data = {
                        'desc' : 'persistent token'
                    };
                    var req = ApiServer.post("/api/v1.1/users/" + name + "/tokens", token.name)
                                  .send(data);
                    if (user.super_user) {
                        req.expect(400, function(err, res) {
                            userToTokens[name] = [token];
                            done();
                        });
                    } else {
                        req.expect(201, function(err, res) {
                            should.not.exist(err);
                            var ptoken = res.body;
                            should.exist(ptoken);
                            name.should.eql(ptoken.username);
                            // store the tokens
                            userToTokens[name] = [token, ptoken];
                            done();
                        });
                    }
                });
            });
        });
    });

    describe("get tokens", function() {
        // setup the test
        var nonSupers = userNames.filter(function(name) {
            return !users[name].super_user;
        });
        // admins map
        var admins_of = {
            superman : { pass : userNames, fail : [] },
            superman2 : { pass : userNames, fail : [] },
            admin1 : {
                pass : ['admin1_1', 'user1']
            },
            admin5 : { pass : nonSupers, fail : ['superman', 'superman2'] },
            user1 : { pass : [] },
            user4 : { pass : [] }
        };
        Object.keys(admins_of).forEach(function(name) {
            if (!admins_of[name].fail) {
                admins_of[name].pass.push(name);
                admins_of[name].fail = TestUtil.invert(userNames, admins_of[name].pass);
            }
        });

        // actual tests
        Object.keys(admins_of).forEach(function(name) {
            var admin_test = admins_of[name];
            var passes = admin_test.pass;
            passes.forEach(function(pass) {
                var testName = name + " should get tokens for " + pass;
                it(testName, function(done) {
                    var reqToken = userToTokens[name][0].name;
                    ApiServer.get('/api/v1.1/users/' + pass + '/tokens', reqToken)
                        .expect(200, function(err, res) {
                        if (err) {
                            console.log(JSON.stringify(err));
                            console.log(JSON.stringify(res.body));
                        }
                        should.not.exist(err);
                        res.body.should.be.an.instanceOf(Array);
                        done();
                    });
                });
            });
            var fails = admin_test.fail;
            fails.forEach(function(fail) {
                var testName = name + " should not get tokens for " + fail;
                it(testName, function(done) {
                    var reqToken = userToTokens[name][0].name;
                    ApiServer.get('/api/v1.1/users/' + fail + '/tokens', reqToken)
                        .expect(401, function(err, res) {
                        should.not.exist(err);
                        done();
                    });
                });
            });
        });

        // some sanity tests
        // ensure that a user's token can't be accessed at the wrong path
        it("superman token should not show up under superman2", function(done) {
            var reqToken = userToTokens.superman[0].name;
            var tokenToReq = userToTokens.superman2[0].name;
            var url = '/api/v1.1/users/superman/tokens/' + tokenToReq;
            ApiServer.get(url, reqToken).expect(404, function(err, res) {
                should.not.exist(err);
                done();
            });
        });

    });

    describe("delete tokens", function() {
        userNames.forEach(function(name) {
            var testName = name + " can delete own tokens";
            it(testName, function(done) {
                var tokens = userToTokens[name];
                async.map(tokens, function(token, callback) {
                    var url = "/api/v1.1/users/" + name + "/tokens/" + token.name;
                    ApiServer.del(url, token.name)
                        .expect(200, function(err, res) {
                        should.not.exist(err);
                        callback(null);
                    });
                }, done);
            });
        });
    });

});
