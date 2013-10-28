/***********************************************************

 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.

 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION

 Copyright (c) 2013 VeriSign, Inc.  All rights reserved.

 ***********************************************************/

var config = require('./test-config');
var server = require("../server")
var should = require('should');
var request = require('supertest');

var mongoose = null;
var app = null;
var httpServer = null;

describe('Hiera API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            app = expressApp;
            httpServer = httpSrv;
            done();
        });
    });

    after(function(done) {
        server.stopServer(httpServer, function() {
            mongoose.connection.db.dropDatabase();
            mongoose.connection.close();
            done();
        });
    });

    describe("Hiera failure cases", function() {
        it("Should error retrieving an unknown entry", function(done) {
            request(app).get("/api/v1/hiera/dne").expect(404, done);
        });
        it("Should error deleting an unknown entry", function(done) {
            request(app).del("/api/v1/hiera/dne").expect(404, done);
        });
        it("Should fail to add an entry missing 'name'", function(done) {
            request(app).post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"hieradata" : {"this" : "should", "not" : "work"}})
                .expect(400, done);
        });
        it("Should fail to add an entry missing 'hieradata'", function(done) {
            request(app).post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"name" : "whatever"})
                .expect(400, done);
        });
        it("Should fail to add a non object hieradata", function(done) {
            request(app).post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"name" : "name", "hieradata" : "string"})
                .expect(400, done);
        });
        it("Should fail to update an entry that doesn't exist", function(done) {
            request(app).put("/api/v1/hiera/dne")
                .set("Content-Type", "application/json")
                .send({"name" : "dne", "hieradata" : {"key1" : "v1"}})
                .expect(404, done);
        });
    });

    describe("Hiera success cases", function() {
        var item = {
            "name" : "host.name.here",
            "hieradata" : {
                "servers" : ["10.0.0.1", "10.0.0.2"],
                "port" : 80
            }
        };
        it("Should add the hiera entry", function(done) {
            request(app).post("/api/v1/hiera")
                .set("Content-Encoding", "application/json")
                .send(item)
                .expect(201, done);
        });
        it("Should receive only the data portion", function(done) {
            request(app)
                .get("/api/v1/hiera/host.name.here")
                .expect(200)
                .end(function(err, res) {
                    should.not.exist(err);
                    should.exist(res.body.servers);
                    should.exist(res.body.port);
                    done();
                });
        });
        it("Should remove the port key and add a name key", function(done) {
            request(app)
                .put("/api/v1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "host.name.here", "hieradata" : {"port" : null, "name" : "some_name"}})
                .expect(200)
                .end(function(err, res) {
                    should.not.exist(err);
                    var hieradata = res.body.hieradata;
                    should.exist(hieradata);
                    should.exist(hieradata.servers);
                    should.not.exist(hieradata.port);
                    should.exist(hieradata.name);
                    done();
                });
        });
        it("Should fail to update an entry with invalid data", function(done) {
            request(app).put("/api/v1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"hieradata" : {"key1" : "v1"}})
                .expect(400, done);
        });
        it("Should delete the hiera entry", function(done) {
            request(app).del("/api/v1/hiera/host.name.here")
                .expect(200, done);
        });
    });
});

