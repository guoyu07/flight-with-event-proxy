define(function (require) {
    'use strict';

    var utils = require('flight/lib/utils');

    var handlerName = function (source, target) {
        return [source, target].join(':');
    };

    return withEventProxy;

    function withEventProxy () {

        this.before('initialize', function () {
            this.withEventProxy = {
                handlers: {}
            };
        });

        this.proxy = function () {
            var args = Array.prototype.slice.call(arguments);
            var last = args.length - 1;

            // eventTransform sugar: if last arg (callback) is a named eventType string,
            // create a proxy with an eventTransform.
            if (typeof args[last] === 'string') {
                var target = args[last];
                args[last] = this.makeProxyWithEventTransform(target);
                this.withEventProxy.handlers[handlerName(args[last - 1], target)] = args[last];
            }

            this.on.apply(this, args);
        };

        this.unproxy = function () {
            var args = Array.prototype.slice.call(arguments);
            var last = args.length - 1;

            // eventTransform sugar: if last arg (callback) is a named eventType string,
            // look up the handler.
            if (typeof args[last] === 'string') {
                var target = args[last];
                args[last] = this.withEventProxy.handlers[handlerName(args[last - 1],target)];
            }

            this.off.apply(this, args);
        };

        this.makeProxyWithEventTransform = function (target) {
            return this.makeProxy(this.eventTransform(function (e) {
                return target;
            }));
        };

        this.eventBundleTransform = function (fn) {
            return function (bundle) {
                return fn(bundle);
            };
        };

        this.makeBundleTransformFor = function (prop) {
            return function (fn) {
                return function (bundle) {
                    bundle[prop] = fn(bundle[prop]);
                    return bundle;
                };
            };
        };

        this.eventTransform = this.makeBundleTransformFor('event');
        this.dataTransform = this.makeBundleTransformFor('data');
        this.nodeTransform = this.makeBundleTransformFor('node');

        /**
         * Composes transform functions to make an event proxy.
         * - Takes optional final argument of Boolean to propagate original
         *   event. Defaults to false.
         * - All other args should be transform functions to compose into the proxy.
         */
        this.makeProxy = function () {
            var fns = Array.prototype.slice.call(arguments);
            var last = fns.length - 1;
            var opts = {};

            // If options were passed as last arg, merge into defaults and remove them from fns.
            if (typeof fns[last] === 'object') {
                opts = utils.merge(opts, fns[last]);
                fns = fns.slice(0, -1);
            }

            fns = fns.map(function (arg) {
                if (typeof arg !== 'function') {
                    throw new Error('makeProxy failed to compose transform functions. Check args.');
                }
                return arg;
            });

            var transform = utils.compose.apply(this, fns.reverse());

            return function (event, data) {
                if (opts.preventDefault) {
                    event.preventDefault();
                }
                if (opts.stopPropagation) {
                    event.stopPropagation();
                }
                // Avoid recursive proxying.
                if (this.isTriggeringProxy) {
                    return false;
                }

                var bundle = transform({
                    event: event.type,
                    data: data,
                    node: event.target
                });

                this.isTriggeringProxy = true;
                this.trigger(bundle.node, bundle.event, bundle.data);
                this.isTriggeringProxy = false;
            }.bind(this);
        };
    }
});
