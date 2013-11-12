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

'use strict';
// A class used to manage the SIS Hooks defined by the /hooks api
// imports..
// node http lib
var http = require('http');
// async js for parallel hook exec
var async = require('async');
// simplified http req
var request = require('request');

(function() {

    // Take in a schemaManager that's already been initialized.
    var HookManager = function(schemaManager) {

        // A mongoose.model object for SIS Schemas
        var SisHookModel = null;
        // this..
        var self = this;

        this.EVENT_INSERT = "insert";
        this.EVENT_UPDATE = "update";
        this.EVENT_DELETE = "delete";

        this.historyManager = require('./history-manager')(schemaManager);

        // initializer funct
        var init = function() {
            // Set up the mongoose.Hook for a SIS Hook
            // Get the model from the definition and name
            var schema_definition = {
                "name" : {"type" : "String", "required" : true, match : /^[a-z0-9_]+$/, "unique" : true },
                "target" : {
                        "type" : {
                            "url" : { "type" : "String", "required" : true },
                            "action" : {"type" : "String", "required" : true, enum : ["GET", "POST", "PUT"]}
                        },
                        "required" : true
                },
                "retry_count" : { "type" : "Number", "min" : 0, "max" : 20, "default" : 0 },
                "retry_delay" : { "type" : "Number", "min" : 1, "max" : 60, "default" : 1 },
                "events": { "type" : [{ "type" : "String",
                                        "required" : true,
                                        "enum" : [self.EVENT_INSERT, self.EVENT_UPDATE, self.EVENT_DELETE]
                                       }], "required" : true},
                "owner": "String",
                "entity_type": "String"
            }
            var schema_name = schemaManager.SIS_HOOK_SCHEMA_NAME;
            SisHookModel = schemaManager.getEntityModel({name : schema_name, definition : schema_definition, owner : "SIS"});
            self.model = SisHookModel;
        }

        // Get all the SIS Hooks in the system
        this.getAll = function(condition, options, callback) {
            SisHookModel.find(condition, null, options, callback);
        }

        // Get a SIS Hook by name
        this.getByName = function(name, callback) {
            SisHookModel.findOne({"name" : name}, callback);
        }

        var validateHookObject = function(modelObj) {
            if (!modelObj) {
                return "No model defined.";
            }
            if(!modelObj.name) {
                return "Hook has no name.";
            }
            if(!modelObj.owner) {
                return "Hook has no owner.";
            }
            if(!modelObj.entity_type) {
                return "Hook has no entity_type.";
            }
            if(!modelObj.target) {
                return "Hook has no target.";
            }
            if(!modelObj.target.url) {
                return "Hook target has no url.";
            }
            if(!modelObj.target.action) {
                return "Hook target has no action.";
            }
            if(!modelObj.events) {
                return "Hook has no on parameter.";
            }
            if(!modelObj.events.length) {
                return "Hook on parameter has no values.";
            }
            return null;
        }

        // Add a SIS Hook.  The modelObj must have the following properties:
        // - "name" : "Schema Name" - cannot be empty
        // - "target" : <json_object> that is a action and url.
        // - "owner" : String - Who owns this
        // - "entity_type" : String - What to fire on
        // - "on" : <json_array> - List of insert,update,delete.
        // -----------------------------------------------------------------
        this.addHook = function(modelObj, callback) {
            var err = validateHookObject(modelObj);
            if (err) {
                callback(err, null);
                return;
            }
            // Valid schema, so now we can create a SIS Schema object to persist
            var entity = new SisHookModel(modelObj);

            // TODO: need to cleanup the entity returned to callback
            entity.save(callback);
        }

        // Update an object schema
        this.updateHook = function(sisHook, callback) {
            var err = validateHookObject(sisHook);
            if (err) {
                callback(err, null);
                return;
            }
            SisHookModel.findOne({name : sisHook.name}, function(err, hookDoc) {
                if (err || !hookDoc) {
                    return callback(err, hookDoc);
                }
                var oldHook = hookDoc.toObject();
                hookDoc.set(sisHook);
                hookDoc.save(function(err, result) {
                    callback(err, result, oldHook);
                });
            });
        }

        // Delete a hook by name.
        this.deleteHook = function(name, callback) {
            SisHookModel.findOne({"name": name}, function(err, result) {
                if (!result) {
                    callback("Hook does not exist.", false);
                } else {
                    result.remove(function(err) {
                        if (err) { return callback(err, null) }
                        callback(null, result);
                    });
                }
            });
        }

        var sendRequest = function(options, retry_count, delay, callback) {
            request(options, function(err, res) {
                if (err || !res || res.statusCode >= 300) {
                    if (retry_count <= 0) {
                        // done with error
                        return callback(err, null);
                    } else {
                        // retry
                        setTimeout(function() {
                            sendRequest(options, retry_count - 1, delay, callback);
                        }, delay * 1000)
                    }
                } else {
                    // success!
                    return callback(null, res.body);
                }
            });
        }

        var dispatchHook = function(hook, entity, event, callback) {
            if (typeof entity['toObject'] == 'function') {
                entity = entity.toObject();
            }
            var data = {
                'hook' : hook.name,
                'entity_type' : hook.entity_type,
                'event' : event,
                'data' : entity
            };
            var options = {
                "uri" : hook.target.url,
                "method" : hook.target.action,
            };
            if (options['method'] == 'GET') {
                data['data'] = JSON.stringify(entity);
                options['qs'] = {'data' : data};
            } else {
                options['json'] = data;
            }
            sendRequest(options, hook.retry_count || 0, hook.retry_delay || 1, callback);
        }

        // hook dispatching methods
        this.dispatchHooks = function(entity, entity_type, event, callback) {
            if (!callback) {
                callback = function(err) {
                    if (err) {
                        console.log("Error running hooks " + err);
                    }
                }
            }
            // find hooks that have the entity_type w/ the
            // event
            var query = {"entity_type" : entity_type, "events" :  event };
            SisHookModel.find(query, function(err, hooks) {
                if (err) {
                    callback(err);
                } else {
                    async.map(hooks, function(hook, cb) {
                        dispatchHook(hook, entity, event, cb);
                    }, callback);
                }
            });
        }

        init();
    }

    module.exports = function(schemaManager) {
        return new HookManager(schemaManager);
    }

})();
