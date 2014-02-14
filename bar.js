node_modules/*
todo.txt
npm-debug.log
test/*
benchmark/*
browser/*
src/*
async
sync
mixed
bench.json
js/browser
js/browser/*
js/debug
js/debug/*
reader.js
read.txt
bench
.editorconfig
.jshintrc
ast_passes.js
mocharun.js
throwaway.js
throwaway.html
bluebird.sublime-workspace
bluebird.sublime-project
changelog.js
.travis.yml
sauce_connect.log
bump.js
,"use strict";
Error.stackTraceLimit = 100;
var astPasses = require("./ast_passes.js");
var node11 = parseInt(process.versions.node.split(".")[1], 10) >= 11;
var Q = require("q");
Q.longStackSupport = true;

module.exports = function( grunt ) {
    var isCI = !!grunt.option("ci");


    function getBrowsers() {
        //Terse format to generate the verbose format required by sauce
        var browsers = {
            "internet explorer|Windows XP": ["7"],
            "internet explorer|Windows 7": ["8"],
            "internet explorer|WIN8": ["10"],
            "internet explorer|WIN8.1": ["11"],
            "firefox|Windows 7": ["3.5", "3.6", "4", "25"],
            "chrome|Windows 7": null,
            "safari|Windows 7": ["5"],
            "safari|OS X 10.8": ["6"],
            "iphone|OS X 10.8": ["6.0"]
        };

        var ret = [];
        for( var browserAndPlatform in browsers) {
            var split = browserAndPlatform.split("|");
            var browser = split[0];
            var platform = split[1];
            var versions = browsers[browserAndPlatform];
            if( versions != null ) {
                for( var i = 0, len = versions.length; i < len; ++i ) {
                    ret.push({
                        browserName: browser,
                        platform: platform,
                        version: versions[i]
                    });
                }
            }
            else {
                ret.push({
                    browserName: browser,
                    platform: platform
                });
            }
        }
        return ret;
    }


    var optionalModuleDependencyMap = {
        "timers.js": ['Promise', 'INTERNAL'],
        "any.js": ['Promise', 'Promise$_CreatePromiseArray', 'PromiseArray'],
        "race.js": ['Promise', 'INTERNAL'],
        "call_get.js": ['Promise'],
        "filter.js": ['Promise', 'Promise$_CreatePromiseArray', 'PromiseArray', 'apiRejection'],
        "generators.js": ['Promise', 'apiRejection', 'INTERNAL'],
        "map.js": ['Promise', 'Promise$_CreatePromiseArray', 'PromiseArray', 'apiRejection'],
        "nodeify.js": ['Promise'],
        "promisify.js": ['Promise', 'INTERNAL'],
        "props.js": ['Promise', 'PromiseArray'],
        "reduce.js": ['Promise', 'Promise$_CreatePromiseArray', 'PromiseArray', 'apiRejection', 'INTERNAL'],
        "settle.js": ['Promise', 'Promise$_CreatePromiseArray', 'PromiseArray'],
        "some.js": ['Promise', 'Promise$_CreatePromiseArray', 'PromiseArray', 'apiRejection'],
        "progress.js": ['Promise', 'isPromiseArrayProxy'],
        "cancel.js": ['Promise', 'INTERNAL'],
        "synchronous_inspection.js": ['Promise']

    };

    var optionalModuleRequireMap = {
        "timers.js": true,
        "race.js": true,
        "any.js": true,
        "call_get.js": true,
        "filter.js": true,
        "generators.js": true,
        "map.js": true,
        "nodeify.js": true,
        "promisify.js": true,
        "props.js": true,
        "reduce.js": true,
        "settle.js": true,
        "some.js": true,
        "progress.js": true,
        "cancel.js": true,
        "synchronous_inspection.js": true

    };

    function getOptionalRequireCode( srcs ) {
        return srcs.reduce(function(ret, cur, i){
            if( optionalModuleRequireMap[cur] ) {
                ret += "require('./"+cur+"')("+ optionalModuleDependencyMap[cur] +");\n";
            }
            return ret;
        }, "") + "\nPromise.prototype = Promise.prototype;\nreturn Promise;\n";
    }

    function getBrowserBuildHeader( sources ) {
        var header = "/**\n * bluebird build version " + gruntConfig.pkg.version + "\n";
        var enabledFeatures = ["core"];
        var disabledFeatures = [];
        featureLoop: for( var key in optionalModuleRequireMap ) {
            for( var i = 0, len = sources.length; i < len; ++i ) {
                var source = sources[i];
                if( source.fileName === key ) {
                    enabledFeatures.push( key.replace( ".js", "") );
                    continue featureLoop;
                }
            }
            disabledFeatures.push( key.replace( ".js", "") );
        }

        header += ( " * Features enabled: " + enabledFeatures.join(", ") + "\n" );

        if( disabledFeatures.length ) {
            header += " * Features disabled: " + disabledFeatures.join(", ") + "\n";
        }
        header += "*/\n";
        return header;
    }

    function applyOptionalRequires( src, optionalRequireCode ) {
        return src.replace( /};([^}]*)$/, optionalRequireCode + "\n};$1");
    }

    var CONSTANTS_FILE = './src/constants.js';
    var BUILD_DEBUG_DEST = "./js/debug/bluebird.js";

    var license;
    function getLicense() {
        if( !license ) {
            var fs = require("fs");
            var text = fs.readFileSync("LICENSE", "utf8");
            text = text.split("\n").map(function(line, index){
                return " * " + line;
            }).join("\n")
            license = "/**\n" + text + "\n */\n";
        }
        return license
    }

    var preserved;
    function getLicensePreserve() {
        if( !preserved ) {
            var fs = require("fs");
            var text = fs.readFileSync("LICENSE", "utf8");
            text = text.split("\n").map(function(line, index){
                if( index === 0 ) {
                    return " * @preserve " + line;
                }
                return " * " + line;
            }).join("\n")
            preserved = "/**\n" + text + "\n */\n";
        }
        return preserved;
    }

    function writeFile( dest, content ) {
        grunt.file.write( dest, content );
        grunt.log.writeln('File "' + dest + '" created.');
    }

    function writeFileAsync( dest, content ) {
        var fs = require("fs");
        return Q.nfcall(fs.writeFile, dest, content).then(function(){
            grunt.log.writeln('File "' + dest + '" created.');
        });
    }

    var gruntConfig = {};

    var getGlobals = function() {
        var fs = require("fs");
        var file = "./src/constants.js";
        var contents = fs.readFileSync(file, "utf8");
        var rconstantname = /CONSTANT\(\s*([^,]+)/g;
        var m;
        var globals = {
            Error: true,
            args: true,
            INLINE_SLICE: false,
            TypeError: true,
            RangeError: true,
            __DEBUG__: false,
            __BROWSER__: false,
            process: false,
            "console": false,
            "require": false,
            "module": false,
            "define": false
        };
        while( ( m = rconstantname.exec( contents ) ) ) {
            globals[m[1]] = false;
        }
        return globals;
    }

    gruntConfig.pkg = grunt.file.readJSON("package.json");

    gruntConfig.jshint = {
        all: {
            options: {
                globals: getGlobals(),

                "bitwise": false,
                "camelcase": true,
                "curly": true,
                "eqeqeq": true,
                "es3": true,
                "forin": true,
                "immed": true,
                "latedef": false,
                "newcap": true,
                "noarg": true,
                "noempty": true,
                "nonew": true,
                "plusplus": false,
                "quotmark": "double",
                "undef": true,
                "unused": true,
                "strict": false,
                "trailing": true,
                "maxparams": 6,
                "maxlen": 80,

                "asi": false,
                "boss": true,
                "eqnull": true,
                "evil": true,
                "expr": false,
                "funcscope": false,
                "globalstrict": false,
                "lastsemic": false,
                "laxcomma": false,
                "laxbreak": false,
                "loopfunc": true,
                "multistr": true,
                "proto": false,
                "scripturl": true,
                "smarttabs": false,
                "shadow": true,
                "sub": true,
                "supernew": false,
                "validthis": true,

                "browser": true,
                "jquery": true,
                "devel": true,


                '-W014': true,
                '-W116': true,
                '-W106': true,
                '-W064': true,
                '-W097': true
            },

            files: {
                src: [
                    "./src/finally.js",
                    "./src/direct_resolve.js",
                    "./src/synchronous_inspection.js",
                    "./src/thenables.js",
                    "./src/progress.js",
                    "./src/cancel.js",
                    "./src/any.js",
                    "./src/race.js",
                    "./src/call_get.js",
                    "./src/filter.js",
                    "./src/generators.js",
                    "./src/map.js",
                    "./src/nodeify.js",
                    "./src/promisify.js",
                    "./src/props.js",
                    "./src/reduce.js",
                    "./src/settle.js",
                    "./src/some.js",
                    "./src/util.js",
                    "./src/schedule.js",
                    "./src/queue.js",
                    "./src/errors.js",
                    "./src/captured_trace.js",
                    "./src/async.js",
                    "./src/catch_filter.js",
                    "./src/promise.js",
                    "./src/promise_array.js",
                    "./src/settled_promise_array.js",
                    "./src/some_promise_array.js",
                    "./src/properties_promise_array.js",
                    "./src/promise_inspection.js",
                    "./src/promise_resolver.js",
                    "./src/promise_spawn.js"
                ]
            }
        }
    };

    if( !isCI ) {
        gruntConfig.jshint.all.options.reporter = require("jshint-stylish");
    }

    gruntConfig.connect = {
        server: {
            options: {
                base: "./browser",
                port: 9999
            }
        }
    };

    gruntConfig.watch = {};

    gruntConfig["saucelabs-mocha"] = {
        all: {
            options: {
                urls: ["http://127.0.0.1:9999/index.html"],
                tunnelTimeout: 5,
                build: process.env.TRAVIS_JOB_ID,
                concurrency: 3,
                browsers: getBrowsers(),
                testname: "mocha tests",
                tags: ["master"]
            }
        }
    };

    gruntConfig.bump = {
      options: {
        files: ['package.json'],
        updateConfigs: [],
        commit: true,
        commitMessage: 'Release v%VERSION%',
        commitFiles: ['-a'],
        createTag: true,
        tagName: 'v%VERSION%',
        tagMessage: 'Version %VERSION%',
        false: true,
        pushTo: 'master',
        gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d' // options to use with '$ git describe'
      }
    };

    grunt.initConfig(gruntConfig);
    grunt.loadNpmTasks("grunt-contrib-connect");
    grunt.loadNpmTasks("grunt-saucelabs");
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-concat');

    function runIndependentTest( file, cb , env) {
        var fs = require("fs");
        var path = require("path");
        var sys = require('sys');
        var spawn = require('child_process').spawn;
        var p = path.join(process.cwd(), "test");

        var stdio = [
            'ignore',
            grunt.option("verbose")
                ? process.stdout
                : 'ignore',
            process.stderr
        ];
        var flags = node11 ? ["--harmony-generators"] : [];
        if( file.indexOf( "mocha/") > -1 || file === "aplus.js" ) {
            var node = spawn('node', flags.concat(["../mocharun.js", file]),
                             {cwd: p, stdio: stdio, env: env});
        }
        else {
            var node = spawn('node', flags.concat(["./"+file]),
                             {cwd: p, stdio: stdio, env:env});
        }
        node.on('exit', exit );

        function exit( code ) {
            if( code !== 0 ) {
                cb(new Error("process didn't exit normally. Code: " + code));
            }
            else {
                cb(null);
            }
        }


    }

    function buildMain( sources, optionalRequireCode ) {
        var fs = require("fs");
        var Q = require("q");
        var root = cleanDirectory("./js/main/");

        return Q.all(sources.map(function( source ) {
            var src = astPasses.removeAsserts( source.sourceCode, source.fileName );
            src = astPasses.inlineExpansion( src, source.fileName );
            src = astPasses.expandConstants( src, source.fileName );
            src = src.replace( /__DEBUG__/g, "false" );
            src = src.replace( /__BROWSER__/g, "false" );
            if( source.fileName === "promise.js" ) {
                src = applyOptionalRequires( src, optionalRequireCode );
            }
            var path = root + source.fileName;
            return writeFileAsync(path, src);
        }));
    }

    function buildDebug( sources, optionalRequireCode ) {
        var fs = require("fs");
        var Q = require("q");
        var root = cleanDirectory("./js/debug/");

        return Q.all(sources.map(function( source ) {
            var src = astPasses.expandAsserts( source.sourceCode, source.fileName );
            src = astPasses.inlineExpansion( src, source.fileName );
            src = astPasses.expandConstants( src, source.fileName );
            src = src.replace( /__DEBUG__/g, "true" );
            src = src.replace( /__BROWSER__/g, "false" );
            if( source.fileName === "promise.js" ) {
                src = applyOptionalRequires( src, optionalRequireCode );
            }
            var path = root + source.fileName;
            return writeFileAsync(path, src);
        }));
    }

    function buildZalgo( sources, optionalRequireCode ) {
        var fs = require("fs");
        var Q = require("q");
        var root = cleanDirectory("./js/zalgo/");

        return Q.all(sources.map(function( source ) {
            var src = astPasses.removeAsserts( source.sourceCode, source.fileName );
            src = astPasses.inlineExpansion( src, source.fileName );
            src = astPasses.expandConstants( src, source.fileName );
            src = astPasses.asyncConvert( src, "async", "invoke", source.fileName);
            src = src.replace( /__DEBUG__/g, "false" );
            src = src.replace( /__BROWSER__/g, "false" );
            if( source.fileName === "promise.js" ) {
                src = applyOptionalRequires( src, optionalRequireCode );
            }
            var path = root + source.fileName;
            return writeFileAsync(path, src);
        }));
    }

    function buildBrowser( sources ) {
        var fs = require("fs");
        var browserify = require("browserify");
        var b = browserify("./js/main/bluebird.js");
        var dest = "./js/browser/bluebird.js";

        var header = getBrowserBuildHeader( sources );

        return Q.nbind(b.bundle, b)({
                detectGlobals: false,
                standalone: "Promise"
        }).then(function(src) {
            return writeFileAsync( dest,
                getLicensePreserve() + src )
        }).then(function() {
            return Q.nfcall(fs.readFile, dest, "utf8" );
        }).then(function( src ) {
            src = header + src;
            return Q.nfcall(fs.writeFile, dest, src );
        });
    }

    function cleanDirectory(dir) {
        if (isCI) return dir;
        var fs = require("fs");
        require("rimraf").sync(dir);
        fs.mkdirSync(dir);
        return dir;
    }

    function getOptionalPathsFromOption( opt ) {
        opt = (opt + "").toLowerCase().split(/\s+/g);
        return optionalPaths.filter(function(v){
            v = v.replace("./src/", "").replace( ".js", "" ).toLowerCase();
            return opt.indexOf(v) > -1;
        });
    }

    var optionalPaths = [
        "./src/timers.js",
        "./src/synchronous_inspection.js",
        "./src/any.js",
        "./src/race.js",
        "./src/call_get.js",
        "./src/filter.js",
        "./src/generators.js",
        "./src/map.js",
        "./src/nodeify.js",
        "./src/promisify.js",
        "./src/props.js",
        "./src/reduce.js",
        "./src/settle.js",
        "./src/some.js",
        "./src/progress.js",
        "./src/cancel.js"
    ];

    var mandatoryPaths = [
        "./src/finally.js",
        "./src/es5.js",
        "./src/bluebird.js",
        "./src/thenables.js",
        "./src/assert.js",
        "./src/global.js",
        "./src/util.js",
        "./src/schedule.js",
        "./src/queue.js",
        "./src/errors.js",
        "./src/errors_api_rejection.js",
        "./src/captured_trace.js",
        "./src/async.js",
        "./src/catch_filter.js",
        "./src/promise.js",
        "./src/promise_array.js",
        "./src/settled_promise_array.js",
        "./src/some_promise_array.js",
        "./src/properties_promise_array.js",
        "./src/promise_inspection.js",
        "./src/promise_resolver.js",
        "./src/promise_spawn.js",
        "./src/direct_resolve.js"
    ];



    function build( paths, isCI ) {
        var fs = require("fs");
        astPasses.readConstants(fs.readFileSync(CONSTANTS_FILE, "utf8"), CONSTANTS_FILE);
        if( !paths ) {
            paths = optionalPaths.concat(mandatoryPaths);
        }
        var optionalRequireCode = getOptionalRequireCode(paths.map(function(v) {
            return v.replace("./src/", "");
        }));

        var Q = require("q");

        var promises = [];
        var sources = paths.map(function(v){
            var promise = Q.nfcall(fs.readFile, v, "utf8");
            promises.push(promise);
            var ret = {};

            ret.fileName = v.replace("./src/", "");
            ret.sourceCode = promise.then(function(v){
                ret.sourceCode = v;
            });
            return ret;
        });

        //Perform common AST passes on all builds
        return Q.all(promises.slice()).then(function(){
            sources.forEach( function( source ) {
                var src = source.sourceCode
                src = astPasses.removeComments(src, source.fileName);
                src = getLicense() + src;
                source.sourceCode = src;
            });

            if( isCI ) {
                return buildDebug( sources, optionalRequireCode );
            }
            else {
                return Q.all([
                    buildMain( sources, optionalRequireCode ).then( function() {
                        return buildBrowser( sources );
                    }),
                    buildDebug( sources, optionalRequireCode ),
                    buildZalgo( sources, optionalRequireCode )
                ]);
            }
        });
    }

    String.prototype.contains = function String$contains( str ) {
        return this.indexOf( str ) >= 0;
    };

    function isSlowTest( file ) {
        return file.contains("2.3.3") ||
            file.contains("bind") ||
            file.contains("unhandled_rejections");
    }

    function testRun( testOption ) {
        var fs = require("fs");
        var path = require("path");
        var done = this.async();
        var adapter = global.adapter = require(BUILD_DEBUG_DEST);

        var totalTests = 0;
        var testsDone = 0;
        function testDone() {
            testsDone++;
            if( testsDone >= totalTests ) {
                done();
            }
        }
        var files;
        if( testOption === "aplus" ) {
            files = fs.readdirSync("test/mocha").filter(function(f){
                return /^\d+\.\d+\.\d+/.test(f);
            }).map(function( f ){
                return "mocha/" + f;
            });
        }
        else {
            files = testOption === "all"
                ? fs.readdirSync('test')
                    .concat(fs.readdirSync('test/mocha')
                        .map(function(fileName){
                            return "mocha/" + fileName
                        })
                    )
                : [testOption + ".js" ];


            if( testOption !== "all" &&
                !fs.existsSync( "./test/" + files[0] ) ) {
                files[0] = "mocha/" + files[0];
            }
        }
        files = files.filter(function(fileName){
            if( !node11 && fileName.indexOf("generator") > -1 ) {
                return false;
            }
            return /\.js$/.test(fileName);
        }).map(function(f){
            return f.replace( /(\d)(\d)(\d)/, "$1.$2.$3" );
        });


        var slowTests = files.filter(isSlowTest);
        files = files.filter(function(file){
            return !isSlowTest(file);
        });

        function runFile(file) {
            totalTests++;
            grunt.log.writeln("Running test " + file );
            var env = undefined;
            if (file.indexOf("bluebird-debug-env-flag") >= 0) {
                env = Object.create(process.env);
                env["BLUEBIRD_DEBUG"] = true;
            }
            runIndependentTest(file, function(err) {
                if( err ) throw new Error(err + " " + file + " failed");
                grunt.log.writeln("Test " + file + " succeeded");
                testDone();
                if( files.length > 0 ) {
                    runFile( files.shift() );
                }
            }, env);
        }

        slowTests.forEach(runFile);

        var maxParallelProcesses = 10;
        var len = Math.min( files.length, maxParallelProcesses );
        for( var i = 0; i < len; ++i ) {
            runFile( files.shift() );
        }
    }

    grunt.registerTask( "build", function() {

        var done = this.async();
        var features = grunt.option("features");
        var paths = null;
        if( features ) {
            paths = getOptionalPathsFromOption( features ).concat( mandatoryPaths );
        }

        build( paths, isCI ).then(function() {
            done();
        }).catch(function(e) {
            if( e.fileName && e.stack ) {
                console.log(e.scriptSrc);
                var stack = e.stack.split("\n");
                stack[0] = stack[0] + " " + e.fileName;
                console.error(stack.join("\n"));
                if (!grunt.option("verbose")) {
                    console.error("use --verbose to see the source code");
                }

            }
            else {
                console.error(e.stack);
            }
            done(false);
        });
    });

    grunt.registerTask( "testrun", function(){
        var testOption = grunt.option("run");


        if( !testOption ) testOption = "all";
        else {
            testOption = ("" + testOption);
            testOption = testOption
                .replace( /\.js$/, "" )
                .replace( /[^a-zA-Z0-9_-]/g, "" );
        }
        testRun.call( this, testOption );
    });

    grunt.registerTask( "test", ["jshint", "build", "testrun"] );
    grunt.registerTask( "test-browser", ["connect", "saucelabs-mocha"]);
    grunt.registerTask( "default", ["jshint", "build"] );
    grunt.registerTask( "dev", ["connect", "watch"] );

};
,# Contributing to bluebird

1. [Directory structure](#directory-structure)
2. [Style guide](#style-guide)
3. [Scripts and macros](#scripts-and-macros)
4. [JSHint](#jshint)
5. [Testing](#testing)

## Directory structure

- `/benchmark` contains benchmark scripts and stats of benchmarks

- `/browser` contains scripts and output for browser testing environment

- `/js` contains automatically generated build output. **NOTE** never commit any changes to these files to git.

    - `/js/browser` contains a file suitable for use in browsers
    - `/js/main` contains the main build to be used with node. The npm package points to /js/main/bluebird.js
    - `/js/debug` contains the debug build to be used with node. Used when running tests
    - `/js/zalgo` contains the zalgo build not to be used by any mortals.

- `/node_modules` contains development dependencies such as grunt

- `/src` contains the source code

- `/test/mocha` contains tests using the mocha testing framework

## Scripts and macros

Scripts and macros are necessary for the code the code to remain readable and performant. For example, there is no way to turn the `arguments` object into an array without using a build step macro unless you want to compromise readability or performance.

`/ast_passes.js` contains functions called ast passes that will parse input source code into an AST, modify it in some way and spit out new source code with the changes reflected.

`/src/constants.js` contains declarations for constants that will be inlined in the resulting code during in the build step. JavaScript lacks a way to express constants, particularly if you are expecting the performance implications.

`/Gruntfile.js` contains task definitions to be used with the Grunt build framework. It for example sets up source code transformations.

`/bench` a bash script to run benchmarks.

`/mocharun.js` a hack script to make mocha work when running multiple tests in parallel processes

## JSHint

Due to JSHint globals being dynamic, the JSHint rules are declared in `/Gruntfile.js`.

## Style guide

Use the same style as is used in the surrounding code.

###Whitespace

- No more than 80 columns per line
- 4 space indentation
- No trailing whitespace
- LF at end of files
- Curly braces can be left out of single statement `if/else/else if`s when it is obvious there will never be multiple statements such as null check at the top of a function for an early return.
- Add an additional new line between logical sections of code.

###Variables

- Use multiple `var` statements instead of a single one with comma separator. Do not declare variables until you need them.

###Equality and type checks

- Always use `===` except when checking for null or undefined. To check for null or undefined, use `x == null`.
- For checks that can be done with `typeof`: do not make helper functions, save results of `typeof` to a variable or make the type string a non-constant. Always write the check in the form `typeof expression === "constant string"` even if it feels like repeating yourself.

## Testing
,Copyright (c) 2014 Petka Antonov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:</p>

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
,#API Reference

- [Core](#core)
    - [`new Promise(Function<Function resolve, Function reject> resolver)`](#new-promisefunctionfunction-resolve-function-reject-resolver---promise)
    - [`.then([Function fulfilledHandler] [, Function rejectedHandler ] [, Function progressHandler ])`](#thenfunction-fulfilledhandler--function-rejectedhandler---function-progresshandler----promise)
    - [`.catch(Function handler)`](#catchfunction-handler---promise)
    - [`.catch([Function ErrorClass|Function predicate...], Function handler)`](#catchfunction-errorclassfunction-predicate-function-handler---promise)
    - [`.error( [rejectedHandler] )`](#error-rejectedhandler----promise)
    - [`.finally(Function handler)`](#finallyfunction-handler---promise)
    - [`.bind(dynamic thisArg)`](#binddynamic-thisarg---promise)
    - [`.done([Function fulfilledHandler] [, Function rejectedHandler ] [, Function progressHandler ])`](#donefunction-fulfilledhandler--function-rejectedhandler---function-progresshandler----promise)
    - [`Promise.try(Function fn [, Array<dynamic>|dynamic arguments] [, dynamic ctx] )`](#promisetryfunction-fn--arraydynamicdynamic-arguments--dynamic-ctx----promise)
    - [`Promise.method(Function fn)`](#promisemethodfunction-fn---function)
    - [`Promise.resolve(dynamic value)`](#promiseresolvedynamic-value---promise)
    - [`Promise.reject(dynamic reason)`](#promiserejectdynamic-reason---promise)
    - [`Promise.defer()`](#promisedefer---promiseresolver)
    - [`Promise.cast(dynamic value)`](#promisecastdynamic-value---promise)
    - [`Promise.bind(dynamic thisArg)`](#promisebinddynamic-thisarg---promise)
    - [`Promise.is(dynamic value)`](#promiseisdynamic-value---boolean)
    - [`Promise.longStackTraces()`](#promiselongstacktraces---void)
- [Progression](#progression)
    - [`.progressed(Function handler)`](#progressedfunction-handler---promise)
- [Promise resolution](#promise-resolution)
    - [`.resolve(dynamic value)`](#resolvedynamic-value---undefined)
    - [`.reject(dynamic reason)`](#rejectdynamic-reason---undefined)
    - [`.progress(dynamic value)`](#progressdynamic-value---undefined)
    - [`.callback`](#callback---function)
- [Timers](#timers)
    - [`.delay(int ms)`](#delayint-ms---promise)
    - [`.timeout(int ms [, String message])`](#timeoutint-ms--string-message---promise)
    - [`Promise.delay([dynamic value], int ms)`](#promisedelaydynamic-value-int-ms---promise)
- [Promisification](#promisification)
    - [`Promise.promisify(Function nodeFunction [, dynamic receiver])`](#promisepromisifyfunction-nodefunction--dynamic-receiver---function)
    - [`Promise.promisify(Object target)`](#promisepromisifyobject-target---object)
    - [`Promise.promisifyAll(Object target)`](#promisepromisifyallobject-target---object)
    - [`.nodeify([Function callback])`](#nodeifyfunction-callback---promise)
- [Cancellation](#cancellation)
    - [`.cancellable()`](#cancellable---promise)
    - [`.cancel()`](#cancel---promise)
    - [`.fork([Function fulfilledHandler] [, Function rejectedHandler ] [, Function progressHandler ])`](#forkfunction-fulfilledhandler--function-rejectedhandler---function-progresshandler----promise)
    - [`.uncancellable()`](#uncancellable---promise)
    - [`.isCancellable()`](#iscancellable---boolean)
- [Synchronous inspection](#synchronous-inspection)
    - [`.isFulfilled()`](#isfulfilled---boolean)
    - [`.isRejected()`](#isrejected---boolean)
    - [`.isPending()`](#isdefer---boolean)
    - [`.isResolved()`](#isresolved---boolean)
    - [`.inspect()`](#inspect---promiseinspection)
- [Generators](#generators)
    - [`Promise.coroutine(GeneratorFunction generatorFunction)`](#promisecoroutinegeneratorfunction-generatorfunction---function)
    - [`Promise.spawn(GeneratorFunction generatorFunction)`](#promisespawngeneratorfunction-generatorfunction---promise)
- [Utility](#utility)
    - [`.call(String propertyName [, dynamic arg...])`](#callstring-propertyname--dynamic-arg---promise)
    - [`.get(String propertyName)`](#getstring-propertyname---promise)
    - [`.return(dynamic value)`](#returndynamic-value---promise)
    - [`.throw(dynamic reason)`](#throwdynamic-reason---promise)
    - [`.toString()`](#tostring---string)
    - [`.toJSON()`](#tojson---object)
    - [`Promise.noConflict()`](#promisenoconflict---object)
    - [`Promise.onPossiblyUnhandledRejection(Function handler)`](#promiseonpossiblyunhandledrejectionfunction-handler---undefined)
- [Collections](#collections)
    - [`.all()`](#all---promise)
    - [`.props()`](#props---promise)
    - [`.settle()`](#settle---promise)
    - [`.any()`](#any---promise)
    - [`.race()`](#race---promise)
    - [`.some(int count)`](#someint-count---promise)
    - [`.spread([Function fulfilledHandler] [, Function rejectedHandler ])`](#spreadfunction-fulfilledhandler--function-rejectedhandler----promise)
    - [`.map(Function mapper)`](#mapfunction-mapper---promise)
    - [`.reduce(Function reducer [, dynamic initialValue])`](#reducefunction-reducer--dynamic-initialvalue---promise)
    - [`.filter(Function filterer)`](#filterfunction-filterer---promise)
    - [`Promise.all(Array<dynamic>|Promise values)`](#promiseallarraydynamicpromise-values---promise)
    - [`Promise.props(Object|Promise object)`](#promisepropsobjectpromise-object---promise)
    - [`Promise.settle(Array<dynamic>|Promise values)`](#promisesettlearraydynamicpromise-values---promise)
    - [`Promise.any(Array<dynamic>|Promise values)`](#promiseanyarraydynamicpromise-values---promise)
    - [`Promise.race(Array|Promise promises)`](#promiseracearraypromise-promises---promise)
    - [`Promise.some(Array<dynamic>|Promise values, int count)`](#promisesomearraydynamicpromise-values-int-count---promise)
    - [`Promise.join([dynamic value...])`](#promisejoindynamic-value---promise)
    - [`Promise.map(Array<dynamic>|Promise values, Function mapper)`](#promisemaparraydynamicpromise-values-function-mapper---promise)
    - [`Promise.reduce(Array<dynamic>|Promise values, Function reducer [, dynamic initialValue])`](#promisereducearraydynamicpromise-values-function-reducer--dynamic-initialvalue---promise)
    - [`Promise.filter(Array<dynamic>|Promise values, Function filterer)`](#promisefilterarraydynamicpromise-values-function-filterer---promise)

##Core

Core methods of `Promise` instances and core static methods of the Promise class.

#####`new Promise(Function<Function resolve, Function reject> resolver)` -> `Promise`

Create a new promise. The passed in function will receive functions `resolve` and `reject` as its arguments which can be called to seal the fate of the created promise.

Example:

```js
function ajaxGetAsync(url) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest;
        xhr.addEventListener("error", reject);
        xhr.addEventListener("load", resolve);
        xhr.open("GET", url);
        xhr.send(null);
    });
}
```

If you pass a promise object to the `resolve` function, the created promise will follow the state of that promise.

<hr>

To make sure a function that returns a promise is following the implicit but critically important contract of promises, you can start a function with `new Promise` if you cannot start a chain immediately:

```js
function getConnection(urlString) {
    return new Promise(function(resolve) {
        //Without new Promise, this throwing will throw an actual exception
        var params = parse(urlString);
        resolve(getAdapater(params).getConnection());
    });
}
```

The above ensures `getConnection()` fulfills the contract of a promise-returning function of never throwing a synchronous exception. Also see [`Promise.try`](#promisetryfunction-fn--arraydynamicdynamic-arguments--dynamic-ctx----promise) and [`Promise.method`](#promisemethodfunction-fn---function)

<hr>

#####`.then([Function fulfilledHandler] [, Function rejectedHandler ] [, Function progressHandler ])` -> `Promise`

[Promises/A+ `.then()`](http://promises-aplus.github.io/promises-spec/) with progress handler. Returns a new promise chained from this promise. The new promise will be rejected or resolved dedefer on the passed `fulfilledHandler`, `rejectedHandler` and the state of this promise.

Example:

```js
promptAsync("Which url to visit?").then(function(url){
    return ajaxGetAsync(url);
}).then(function(contents){
    alertAsync("The contents were: " + contents);
}).catch(function(e){
    alertAsync("Exception " + e);
});
```

<hr>

#####`.catch(Function handler)` -> `Promise`

This is a catch-all exception handler, shortcut for calling `.then(null, handler)` on this promise. Any exception happening in a `.then`-chain will propagate to nearest `.catch` handler.

*For compatibility with earlier ECMAScript version, an alias `.caught()` is provided for `.catch()`.*

<hr>

#####`.catch([Function ErrorClass|Function predicate...], Function handler)` -> `Promise`

This extends `.catch` to work more like catch-clauses in languages like Java or C#. Instead of manually checking `instanceof` or `.name === "SomeError"`, you may specify a number of error constructors which are eligible for this catch handler. The catch handler that is first met that has eligible constructors specified, is the one that will be called.

Example:

```js
somePromise.then(function(){
    return a.b.c.d();
}).catch(TypeError, function(e){
    //If a is defined, will end up here because
    //it is a type error to reference property of undefined
}).catch(ReferenceError, function(e){
    //Will end up here if a wasn't defined at all
}).catch(function(e){
    //Generic catch-the rest, error wasn't TypeError nor
    //ReferenceError
});
 ```

You may also add multiple filters for a catch handler:

```js
somePromise.then(function(){
    return a.b.c.d();
}).catch(TypeError, ReferenceError, function(e){
    //Will end up here on programmer error
}).catch(NetworkError, TimeoutError, function(e){
    //Will end up here on expected everyday network errors
}).catch(function(e){
    //Catch any unexpected errors
});
```

For a parameter to be considered a type of error that you want to filter, you need the constructor to have its `.prototype` property be `instanceof Error`.

Such a constructor can be minimally created like so:

```js
function MyCustomError() {}
MyCustomError.prototype = Object.create(Error.prototype);
```

Using it:

```js
Promise.resolve().then(function(){
    throw new MyCustomError();
}).catch(MyCustomError, function(e){
    //will end up here now
});
```

However if you  want stack traces and cleaner string output, then you should do:

*in Node.js and other V8 environments, with support for `Error.captureStackTrace`*

```js
function MyCustomError(message) {
    this.message = message;
    this.name = "MyCustomError";
    Error.captureStackTrace(this, MyCustomError);
}
MyCustomError.prototype = Object.create(Error.prototype);
MyCustomError.prototype.constructor = MyCustomError;
```

Using CoffeeScript's `class` for the same:

```coffee
class MyCustomError extends Error
  constructor: (@message) ->
    @name = "MyCustomError"
    Error.captureStackTrace(this, MyCustomError)
```

This method also supports predicate-based filters. If you pass a
predicate function instead of an error constructor, the predicate will receive
the error as an argument. The return result of the predicate will be used
determine whether the error handler should be called.

Predicates should allow for very fine grained control over caught errors:
pattern matching, error-type sets with set operations and many other techniques
can be implemented on top of them.

Example of using a predicate-based filter:

```js
var Promise = require("bluebird");
var request = Promise.promisify(require("request"));

function clientError(e) {
    return e.code >= 400 && e.code < 500;
}

request("http://www.google.com").then(function(contents){
    console.log(contents);
}).catch(clientError, function(e){
   //A client error like 400 Bad Request happened
});
```

*For compatibility with earlier ECMAScript version, an alias `.caught()` is provided for `.catch()`.*

<hr>

#####`.error( [rejectedHandler] )` -> `Promise`

Like `.catch` but instead of catching all types of exceptions, it only catches those that don't originate from thrown errors but rather from explicit rejections.

For example, if a promisified function errbacks the node-style callback with an error, that could be caught with `.error()`. However if the node-style callback **throws** an error, only `.catch` would catch that.

In the following example you might want to handle just the `SyntaxError` from JSON.parse and Filesystem errors from `fs` but let programmer errors bubble as unhandled rejections:

```js
var fs = Promise.promisifyAll(require("fs"));

fs.readFileAsync("myfile.json").then(JSON.parse).then(function (json) {
    console.log("Successful json")
}).catch(SyntaxError, function (e) {
    console.error("file contains invalid json");
}).error(function (e) {
    console.error("unable to read file, because: ", e.message);
});
```

Now, because there is no catch-all handler, if you typed `console.lag` (causes an error you don't expect), you will see:

```
Possibly unhandled TypeError: Object #<Console> has no method 'lag'
    at application.js:8:13
From previous event:
    at Object.<anonymous> (application.js:7:4)
    at Module._compile (module.js:449:26)
    at Object.Module._extensions..js (module.js:467:10)
    at Module.load (module.js:349:32)
    at Function.Module._load (module.js:305:12)
    at Function.Module.runMain (module.js:490:10)
    at startup (node.js:121:16)
    at node.js:761:3
```

*( If you don't get the above - you need to enable [long stack traces](#promiselongstacktraces---void) )*

And if the file contains invalid JSON:

```
file contains invalid json
```

And if the `fs` module causes an error like file not found:

```
unable to read file, because:  ENOENT, open 'not_there.txt'
```

<hr>

#####`.finally(Function handler)` -> `Promise`

Pass a handler that will be called regardless of this promise's fate. Returns a new promise chained from this promise. There are special semantics for `.finally()` in that the final value cannot be modified from the handler.

Consider the example:

```js
function anyway() {
    $("#ajax-loader-animation").hide();
}

function ajaxGetAsync(url) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest;
        xhr.addEventListener("error", reject);
        xhr.addEventListener("load", resolve);
        xhr.open("GET", url);
        xhr.send(null);
    }).then(anyway, anyway);
}
```

This example doesn't work as intended because the `then` handler actually swallows the exception and returns `undefined` for any further chainers.

The situation can be fixed with `.finally`:

```js
function ajaxGetAsync(url) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest;
        xhr.addEventListener("error", reject);
        xhr.addEventListener("load", resolve);
        xhr.open("GET", url);
        xhr.send(null);
    }).finally(function(){
        $("#ajax-loader-animation").hide();
    });
}
```

Now the animation is hidden but an exception or the actual return value will automatically skip the finally and propagate to further chainers. This is more in line with the synchronous `finally` keyword.

The `.finally` works like [Q's finally method](https://github.com/kriskowal/q/wiki/API-Reference#promisefinallycallback).

*For compatibility with earlier ECMAScript version, an alias `.lastly()` is provided for `.finally()`.*

<hr>

#####`.bind(dynamic thisArg)` -> `Promise`

Create a promise that follows this promise, but is bound to the given `thisArg` value. A bound promise will call its handlers with the bound value set to `this`. Additionally promises derived from a bound promise will also be bound promises with the same `thisArg` binding as the original promise.

<hr>

Without arrow functions that provide lexical `this`, the correspondence between async and sync code breaks down when writing object-oriented code. `.bind()` alleviates this.

Consider:

```js
MyClass.prototype.method = function() {
    try {
        var contents = fs.readFileSync(this.file);
        var url = urlParse(contents);
        var result = this.httpGetSync(url);
        var refined = this.refine(result);
        return this.writeRefinedSync(refined);
    }
    catch (e) {
        this.error(e.stack);
    }
};
```

The above has a direct translation:

```js
MyClass.prototype.method = function() {
    return fs.readFileAsync(this.file).bind(this)
    .then(function(contents) {
        var url = urlParse(contents);
        return this.httpGetAsync(url);
    }).then(function(result){
        var refined = this.refine(result);
        return this.writeRefinedAsync(refined);
    }).catch(function(e){
        this.error(e.stack);
    });
};
```

`.bind()` is the most efficient way of utilizing `this` with promises. The handler functions in the above code are not closures and can therefore even be hoisted out if needed. There is literally no overhead when propagating the bound value from one promise to another.

<hr>

`.bind()` also has a useful side purpose - promise handlers don't need to share a function to use shared state:

```js
somethingAsync().bind({})
.then(function (aValue, bValue) {
    this.aValue = aValue;
    this.bValue = bValue;
    return somethingElseAsync(aValue, bValue);
})
.then(function (cValue) {
    return this.aValue + this.bValue + cValue;
});
```

The above without `.bind()` could be achieved with:

```js
var scope = {};
somethingAsync()
.then(function (aValue, bValue) {
    scope.aValue = aValue;
    scope.bValue = bValue;
    return somethingElseAsync(aValue, bValue);
})
.then(function (cValue) {
    return scope.aValue + scope.bValue + cValue;
});
```

However, there are many differences when you look closer:

- Requires a statement so cannot be used in an expression context
- If not there already, an additional wrapper function is required to avoid leaking or sharing `scope`
- The handler functions are now closures, thus less efficient and not reusable

<hr>

Note that bind is only propagated with promise transformation. If you create new promise chains inside a handler, those chains are not bound to the "upper" `this`:

```js
something().bind(var1).then(function(){
    //`this` is var1 here
    return Promise.all(getStuff()).then(function(results){
        //`this` is undefined here
        //refine results here etc
    });
}).then(function(){
    //`this` is var1 here
});
```

However, if you are utilizing the full bluebird API offering, you will *almost never* need to resort to nesting promises in the first place. The above should be written more like:

```js
something().bind(var1).then(function() {
    //`this` is var1 here
    return getStuff();
}).map(function(result){
    //`this` is var1 here
    //refine result here
}).then(function(){
    //`this` is var1 here
});
```

Also see [this Stackoverflow answer](http://stackoverflow.com/a/19467053/995876) on a good example on how utilizing the collection instance methods like [`.map()`](#mapfunction-mapper---promise) can clean up code.

<hr>

If you don't want to return a bound promise to the consumers of a promise, you can rebind the chain at the end:

```js
MyClass.prototype.method = function() {
    return fs.readFileAsync(this.file).bind(this)
    .then(function(contents) {
        var url = urlParse(contents);
        return this.httpGetAsync(url);
    }).then(function(result){
        var refined = this.refine(result);
        return this.writeRefinedAsync(refined);
    }).catch(function(e){
        this.error(e.stack);
    }).bind(); //The `thisArg` is implicitly undefined - I.E. the default promise `this` value
};
```

Rebinding can also be abused to do something gratuitous like this:

```js
Promise.resolve("my-element")
    .bind(document)
    .then(document.getElementById)
    .bind(console)
    .then(console.log);
```

The above does `console.log(document.getElementById("my-element"));`. The `.bind()`s are necessary because in browser neither of the methods can be called as a stand-alone function.

<hr>

#####`.done([Function fulfilledHandler] [, Function rejectedHandler ] [, Function progressHandler ])` -> `Promise`

Like `.then()`, but any unhandled rejection that ends up here will be thrown as an error.

<hr>

#####`Promise.try(Function fn [, Array<dynamic>|dynamic arguments] [, dynamic ctx] )` -> `Promise`

Start the chain of promises with `Promise.try`. Any synchronous exceptions will be turned into rejections on the returned promise.

```js
function getUserById(id) {
    return Promise.try(function(){
        if (typeof id !== "number") {
            throw new Error("id must be a number");
        }
        return db.getUserById(id);
    });
}
```

Now if someone uses this function, they will catch all errors in their Promise `.catch` handlers instead of having to handle both synchronous and asynchronous exception flows.

Note about second argument: if it's specifically a true array, its values become respective arguments for the function call. Otherwise it is passed as is as the first argument for the function call.

*For compatibility with earlier ECMAScript version, an alias `Promise.attempt()` is provided for `Promise.try()`.*

<hr>

#####`Promise.method(Function fn)` -> `Function`

Returns a new function that wraps the given function `fn`. The new function will always return a promise that is fulfilled with the original functions return values or rejected with thrown exceptions from the original function.

This method is convenient when a function can sometimes return synchronously or throw synchronously.

Example without using `Promise.method`:

```js
MyClass.prototype.method = function(input) {
    if (!this.isValid(input)) {
        return Promise.reject(new TypeError("input is not valid"));
    }

    if (this.cache(input)) {
        return Promise.resolve(this.someCachedValue);
    }

    return db.queryAsync(input).bind(this).then(function(value) {
        this.someCachedValue = value;
        return value;
    });
};
```

Using the same function `Promise.method`, there is no need to manually wrap direct return or throw values into a promise:

```js
MyClass.prototype.method = Promise.method(function(input) {
    if (!this.isValid(input)) {
        throw new TypeError("input is not valid");
    }

    if (this.cachedFor(input)) {
        return this.someCachedValue;
    }

    return db.queryAsync(input).bind(this).then(function(value) {
        this.someCachedValue = value;
        return value;
    });
});
```

<hr>

#####`Promise.resolve(dynamic value)` -> `Promise`

Create a promise that is resolved with the given `value`. If `value` is a thenable or promise, the returned promise will assume its state.

<hr>

#####`Promise.reject(dynamic reason)` -> `Promise`

Create a promise that is rejected with the given `reason`.

<hr>

#####`Promise.defer()` -> `PromiseResolver`

Create a promise with undecided fate and return a `PromiseResolver` to control it. See [Promise resolution](#promise-resolution).

The use of `Promise.defer` is discouraged - it is much more awkward and error-prone than using `new Promise`.

<hr>

#####`Promise.cast(dynamic value)` -> `Promise`

Cast the given `value` to a trusted promise. If `value` is already a trusted `Promise`, it is returned as is. If `value` is not a thenable, a fulfilled Promise is returned with `value` as its fulfillment value. If `value` is a thenable (Promise-like object, like those returned by jQuery's `$.ajax`), returns a trusted Promise that assimilates the state of the thenable.

Example: (`$` is jQuery)

```js
Promise.cast($.get("http://www.google.com")).then(function(){
    //Returning a thenable from a handler is automatically
    //cast to a trusted Promise as per Promises/A+ specification
    return $.post("http://www.yahoo.com");
}).then(function(){

}).catch(function(e){
    //jQuery doesn't throw real errors so use catch-all
    console.log(e.statusText);
});
```

<hr>

#####`Promise.bind(dynamic thisArg)` -> `Promise`

Sugar for `Promise.resolve(undefined).bind(thisArg);`. See [`.bind()`](#binddynamic-thisarg---promise).

<hr>

#####`Promise.is(dynamic value)` -> `boolean`

See if `value` is a trusted Promise.

```js
Promise.is($.get("http://www.google.com")); //false
Promise.is(Promise.cast($.get("http://www.google.com"))) //true
```

<hr>

#####`Promise.longStackTraces()` -> `void`

Call this right after the library is loaded to enabled long stack traces. Long stack traces cannot be disabled after being enabled, and cannot be enabled after promises have alread been created. Long stack traces imply a substantial performance penalty, around 4-5x for throughput and 0.5x for latency.

Long stack traces are enabled by default in the debug build.

To enable them in all instances of bluebird in node.js, use the environment variable `BLUEBIRD_DEBUG`:

```
BLUEBIRD_DEBUG=1 node server.js
```

You should enabled long stack traces if you want better debugging experience. For example:

```js
Promise.longStackTraces();
Promise.resolve().then(function outer() {
    return Promise.resolve().then(function inner() {
        return Promise.resolve().then(function evenMoreInner() {
            a.b.c.d()
        }).catch(function catcher(e){
            console.error(e.stack);
        });
    });
});
```

Gives

    ReferenceError: a is not defined
        at evenMoreInner (<anonymous>:6:13)
    From previous event:
        at inner (<anonymous>:5:24)
    From previous event:
        at outer (<anonymous>:4:20)
    From previous event:
        at <anonymous>:3:9
        at Object.InjectedScript._evaluateOn (<anonymous>:581:39)
        at Object.InjectedScript._evaluateAndWrap (<anonymous>:540:52)
        at Object.InjectedScript.evaluate (<anonymous>:459:21)

While with long stack traces disabled, you would get:

    ReferenceError: a is not defined
        at evenMoreInner (<anonymous>:6:13)
        at tryCatch1 (<anonymous>:41:19)
        at Promise$_resolvePromise [as _resolvePromise] (<anonymous>:1739:13)
        at Promise$_resolveLast [as _resolveLast] (<anonymous>:1520:14)
        at Async$_consumeFunctionBuffer [as _consumeFunctionBuffer] (<anonymous>:560:33)
        at Async$consumeFunctionBuffer (<anonymous>:515:14)
        at MutationObserver.Promise$_Deferred (<anonymous>:433:17)

On client side, long stack traces currently only work in Firefox and Chrome.

<hr>

##Progression

#####`.progressed(Function handler)` -> `Promise`

Shorthand for `.then(null, null, handler);`. Attach a progress handler that will be called if this promise is progressed. Returns a new promise chained from this promise.

<hr>

##Promise resolution

A `PromiseResolver` can be used to control the fate of a promise. It is like "Deferred" known in jQuery. The `PromiseResolver` objects have a `.promise` property which returns a reference to the controlled promise that can be passed to clients. `.promise` of a `PromiseResolver` is not a getter function to match other implementations.

The methods of a `PromiseResolver` have no effect if the fate of the underlying promise is already decided (follow, reject, fulfill).

The use of `Promise.defer` and deferred objects is discouraged - it is much more awkward and error-prone than using `new Promise`.

<hr>

#####`.resolve(dynamic value)` -> `undefined`

Resolve the underlying promise with `value` as the resolution value. If `value` is a thenable or a promise, the underlying promise will assume its state.

<hr>

#####`.reject(dynamic reason)` -> `undefined`

Reject the underlying promise with `reason` as the rejection reason.

<hr>

#####`.progress(dynamic value)` -> `undefined`

Progress the underlying promise with `value` as the progression value.

Example

```js
function delay(ms) {
    var resolver = Promise.defer();
    var now = Date.now();
    setTimeout(function(){
        resolver.resolve(Date.now() - now);
    }, ms);
    return resolver.promise;
}

delay(500).then(function(ms){
    console.log(ms + " ms passed");
});
```

<hr>

#####`.callback` -> `Function`

Gives you a callback representation of the `PromiseResolver`. Note that this is not a method but a property. The callback accepts error object in first argument and success values on the 2nd parameter and the rest, I.E. node js conventions.

If the the callback is called with multiple success values, the resolver fullfills its promise with an array of the values.

```js
var fs = require("fs");
function readAbc() {
    var resolver = Promise.defer();
    fs.readFile("abc.txt", resolver.callback);
    return resolver.promise;
}

readAbc()
.then(function(abcContents) {
    console.log(abcContents);
})
.catch(function(e) {
    console.error(e);
});
```

This example is an alternative to automatic promisification of node functions.

*Performance tips*

The `callback` is actually an accessor property (except on legacy browsers where it's eager data property) - so save the result if you need to call it multiple times.

This is more efficient way of promisification than using `new Promise`.

<hr>

##Timers

Methods to delay and time promises out.

#####`.delay(int ms)` -> `Promise`

Same as calling [`Promise.delay(this, ms)`](#promisedelaydynamic-value-int-ms---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.timeout(int ms [, String message])` -> `Promise`

Returns a promise that will be fulfilled with this promise's fulfillment value or rejection reason. However, if this promise is not fulfilled or rejected within `ms` milliseconds, the returned promise is rejected with a `Promise.TimeoutError` instance.

You may specify a custom error message with the `message` parameter.

The example function `fetchContent` tries to fetch the contents of a web page with a 50ms timeout and sleeping 100ms between each retry. If there is no response after 5 retries, then the returned promise is rejected with a `ServerError` (made up error type). Additionally the whole process can be cancelled from outside at any point.

```js
function fetchContent(retries) {
    if (!retries) retries = 0;
    var jqXHR = $.get("http://www.slowpage.com");
    //Cast the jQuery promise into a bluebird promise
    return Promise.cast(jqXHR)
        .cancellable()
        .timeout(50)
        .catch(Promise.TimeoutError, function() {
            if (retries < 5) {
                return Promise.delay(100).then(function(){
                    return fetchContent(retries+1);
                });
            }
            else {
                throw new ServerError("not responding after 5 retries");
            }
        })
        .catch(Promise.CancellationError, function(er) {
            jqXHR.abort();
            throw er; //Don't swallow it
        });
}
```

<hr>

#####`Promise.delay([dynamic value], int ms)` -> `Promise`

Returns a promise that will be fulfilled with `value` (or `undefined`) after given `ms` milliseconds. If `value` is a promise, the delay will start counting down when it is fulfilled and the returned promise will be fulfilled with the fulfillment value of the `value` promise.

```js
Promise.delay(500).then(function(){
    console.log("500 ms passed");
    return "Hello world";
}).delay(500).then(function(helloWorldString) {
    console.log(helloWorldString);
    console.log("another 500 ms passed") ;
});
```

<hr>

##Promisification

#####`Promise.promisify(Function nodeFunction [, dynamic receiver])` -> `Function`

Returns a function that will wrap the given `nodeFunction`. Instead of taking a callback, the returned function will return a promise whose fate is decided by the callback behavior of the given node function. The node function should conform to node.js convention of accepting a callback as last argument and calling that callback with error as the first argument and success value on the second argument.

If the `nodeFunction` calls its callback with multiple success values, the fulfillment value will be an array of them.

If you pass a `receiver`, the `nodeFunction` will be called as a method on the `receiver`.

Example of promisifying the asynchronous `readFile` of node.js `fs`-module:

```js
var readFile = Promise.promisify(require("fs").readFile);

readFile("myfile.js", "utf8").then(function(contents){
    return eval(contents);
}).then(function(result){
    console.log("The result of evaluating myfile.js", result);
}).catch(SyntaxError, function(e){
    console.log("File had syntax error", e);
//Catch any other error
}).catch(function(e){
    console.log("Error reading file", e);
});
```

Note that if the node function is a method of some object, you need to pass the object as the second argument like so:

```js
var redisGet = Promise.promisify(redisClient.get, redisClient);
redisGet.then(function(){
    //...
});
```

**Tip**

Use [`.spread`](#spreadfunction-fulfilledhandler--function-rejectedhandler----promise) with APIs that have multiple success values:

```js
var Promise = require("bluebird");
var request = Promise.promisify(require('request'));
request("http://www.google.com").spread(function(request, body) {
    console.log(body);
}).catch(function(err) {
    console.error(err);
});
```

The above uses [request](https://github.com/mikeal/request) library which has a callback signature of multiple success values.

<hr>

#####`Promise.promisify(Object target)` -> `Object`

This overload has been **deprecated**. The overload will continue working for now. The recommended method for promisifying multiple methods at once is [`Promise.promisifyAll(Object target)`](#promisepromisifyallobject-target---object)

<hr>

#####`Promise.promisifyAll(Object target)` -> `Object`

Promisifies the entire object by going through the object's properties and creating an async equivalent of each function on the object and its prototype chain. The promisified method name will be the original method name postfixed with `Async`. Returns the input object.

Note that the original methods on the object are not overwritten but new methods are created with the `Async`-postfix. For example, if you `promisifyAll()` the node.js `fs` object use `fs.statAsync()` to call the promisified `stat` method.

Example:

```js
Promise.promisifyAll(RedisClient.prototype);

//Later on, all redis client instances have promise returning functions:

redisClient.hexistsAsync("myhash", "field").then(function(v){

}).catch(function(e){

});
```

If you don't want to write on foreign prototypes, you can sub-class the target and promisify your subclass:

```js
function MyRedisClient() {
    RedisClient.apply(this, arguments);
}
MyRedisClient.prototype = Object.create(RedisClient.prototype);
MyRedisClient.prototype.constructor = MyRedisClient;
Promise.promisify(MyRedisClient.prototype);
```

The promisified methods will be written on the `MyRedisClient.prototype` instead. This specific example doesn't actually work with `node_redis` because the `createClient` factory is hardcoded to instantiate `RedisClient` from closure.


It also works on singletons or specific instances:

```js
var fs = Promise.promisifyAll(require("fs"));

fs.readFileAsync("myfile.js", "utf8").then(function(contents){
    console.log(contents);
}).catch(function(e){
    console.error(e.stack);
});
```

The entire prototype chain of the object is promisified on the object. Only enumerable are considered. If the object already has a promisified version of the method, it will be skipped. The target methods are assumed to conform to node.js callback convention of accepting a callback as last argument and calling that callback with error as the first argument and success value on the second argument. If the node method calls its callback with multiple success values, the fulfillment value will be an array of them.

If a method already has `"Async"` postfix, it will be duplicated. E.g. `getAsync`'s promisified name is `getAsyncAsync`.

<hr>

#####`.nodeify([Function callback])` -> `Promise`

Register a node-style callback on this promise. When this promise is is either fulfilled or rejected, the node callback will be called back with the node.js convention where error reason is the first argument and success value is the second argument. The error argument will be `null` in case of success.

Returns back this promise instead of creating a new one. If the `callback` argument is not a function, this method does not do anything.

This can be used to create APIs that both accept node-style callbacks and return promises:

```js
function getDataFor(input, callback) {
    return dataFromDataBase(input).nodeify(callback);
}
```

The above function can then make everyone happy.

Promises:

```js
getDataFor("me").then(function(dataForMe) {
    console.log(dataForMe);
});
```

Normal callbacks:

```js
getDataFor("me", function(err, dataForMe) {
    if( err ) {
        console.error( err );
    }
    console.log(dataForMe);
});
```

There is no effect on peformance if the user doesn't actually pass a node-style callback function.

<hr>

##Cancellation

By default, a promise is not cancellable. A promise can be marked as cancellable with `.cancellable()`. A cancellable promise can be cancelled if it's not resolved. Cancelling a promise propagates to the farthest cancellable ancestor of the target promise that is still pending, and rejects that promise with `CancellationError`. The rejection will then propagate back to the original promise and to its descendants. This roughly follows the semantics described [here](https://github.com/promises-aplus/cancellation-spec/issues/7).

Promises marked with `.cancellable()` return cancellable promises automatically.

If you are the resolver for a promise, you can react to a cancel in your promise by catching the `CancellationError`:

```js
function ajaxGetAsync(url) {
    var xhr = new XMLHttpRequest;
    return new Promise(function (resolve, reject) {
        xhr.addEventListener("error", reject);
        xhr.addEventListener("load", resolve);
        xhr.open("GET", url);
        xhr.send(null);
    }).cancellable().catch(Promise.CancellationError, function(e) {
        xhr.abort();
        throw e; //Don't swallow it
    });
}
```

<hr>

#####`.cancellable()` -> `Promise`

Marks this promise as cancellable. Promises by default are not cancellable after v0.11 and must be marked as such for [`.cancel()`](#cancel---promise) to have any effect. Marking a promise as cancellable is infectious and you don't need to remark any descendant promise.

If you have code written prior v0.11 using cancellation, add calls to `.cancellable()` at the starts of promise chains that need to support
cancellation in themselves or somewhere in their descendants.

<hr>

#####`.cancel()` -> `Promise`

Cancel this promise. The cancellation will propagate
to farthest cancellable ancestor promise which is still pending.

That ancestor will then be rejected with a `CancellationError` (get a reference from `Promise.CancellationError`)
object as the rejection reason.

In a promise rejection handler you may check for a cancellation
by seeing if the reason object has `.name === "Cancel"`.

Promises are by default not cancellable. Use [`.cancellable()`](#cancellable---promise) to mark a promise as cancellable.

<hr>

#####`.fork([Function fulfilledHandler] [, Function rejectedHandler ] [, Function progressHandler ])` -> `Promise`

Like `.then()`, but cancellation of the the returned promise
or any of its descendant will not propagate cancellation
to this promise or this promise's ancestors.

<hr>

#####`.uncancellable()` -> `Promise`

Create an uncancellable promise based on this promise.

<hr>

#####`.isCancellable()` -> `boolean`

See if this promise can be cancelled.

<hr>

##Synchronous inspection

Because `.then()` must give asynchronous guarantees, it cannot be used to inspect a given promise's state synchronously. The following code won't work:

```js
var wasFulfilled = false;
var wasRejected = false;
var resolutionValueOrRejectionReason = null;
somePromise.then(function(v){
    wasFulfilled = true;
    resolutionValueOrRejectionReason = v
}).catch(function(v){
    wasRejected = true;
    resolutionValueOrRejectionReason = v
});
//Using the variables won't work here because .then must be called asynchronously
```

Synchronous inspection API allows you to do this like so:

```js
var inspection = somePromise.inspect();

if(inspection.isFulfilled()){
    console.log("Was fulfilled with", inspection.value());
}
```

<hr>

#####`.isFulfilled()` -> `boolean`

See if this `promise` has been fulfilled.

<hr>

#####`.isRejected()` -> `boolean`

See if this `promise` has been rejected.

<hr>

#####`.isPending()` -> `boolean`

See if this `promise` is still defer.

<hr>

#####`.isResolved()` -> `boolean`

See if this `promise` is resolved -> either fulfilled or rejected.

<hr>

#####`.inspect()` -> `PromiseInspection`

Synchronously inspect the state of this `promise`. The `PromiseInspection` will represent the state of the promise as snapshotted at the time of calling `.inspect()`. It will have the following methods:

`.isFulfilled()` -> `boolean`

See if the underlying promise was fulfilled at the creation time of this inspection object.

`.isRejected()` -> `boolean`

See if the underlying promise was rejected at the creation time of this inspection object.

`.isPending()` -> `boolean`

See if the underlying promise was defer at the creation time of this inspection object.

`.value()` -> `dynamic`, throws `TypeError`

Get the fulfillment value of the underlying promise. Throws if the promise wasn't fulfilled at the creation time of this inspection object.

`.error()` -> `dynamic`, throws `TypeError`

Get the rejection reason for the underlying promise. Throws if the promise wasn't rejected at the creation time of this inspection object.

<hr>

##Generators

Using ECMAScript6 generators feature to implement C# 5.0 `async/await` like syntax.

#####`Promise.coroutine(GeneratorFunction generatorFunction)` -> `Function`

Returns a function that can use `yield` to run asynchronous code synchronously. This feature requires the support of generators which are drafted in the next version of the language. Node version greater than `0.11.2` is required and needs to be executed with the `--harmony-generators` (or `--harmony`) command-line switch.

This is the recommended, simplest and most performant way of using asynchronous generators with bluebird. It is even faster than typical promise code because the creation of new anonymous function identities at runtime can be completely avoided without obfuscating your code.

```js
var Promise = require("bluebird");

function delay(ms) {
    return new Promise(function(f){
        setTimeout(f, ms);
    });
}

function PingPong() {

}

PingPong.prototype.ping = Promise.coroutine(function* (val) {
    console.log("Ping?", val)
    yield delay(500)
    this.pong(val+1)
});

PingPong.prototype.pong = Promise.coroutine(function* (val) {
    console.log("Pong!", val)
    yield delay(500);
    this.ping(val+1)
});

var a = new PingPong();
a.ping(0);
```

Running the example with node version at least 0.11.2:

    $ node --harmony test.js
    Ping? 0
    Pong! 1
    Ping? 2
    Pong! 3
    Ping? 4
    Pong! 5
    Ping? 6
    Pong! 7
    Ping? 8
    ...

When called, the coroutine function will start an instance of the generator and returns a promise for its final value.

Doing `Promise.coroutine(function*(){})` is almost like using the C# `async` keyword to mark the function, with `yield` working as the `await` keyword. Promises are somewhat like `Task`s.

**Tip**

If you yield an array then its elements are implicitly waited for.

You can combine it with ES6 destructuring for some neat syntax:

```js
var getData = Promise.coroutine(function* (urlA, urlB) {
    [resultA, resultB] = yield [http.getAsync(urlA), http.getAsync(urlB)];
    //use resultA
    //use resultB
});
```

You might wonder why not just do this?

```js
var getData = Promise.coroutine(function* (urlA, urlB) {
    var resultA = yield http.getAsync(urlA);
    var resultB = yield http.getAsync(urlB);
});
```

The problem with the above is that the requests are not done in parallel. It will completely wait for request A to complete before even starting request B. In the array syntax both requests fire off at the same time in parallel.

<hr>

#####`Promise.spawn(GeneratorFunction generatorFunction)` -> `Promise`

Spawn a coroutine which may yield promises to run asynchronous code synchronously. This feature requires the support of generators which are drafted in the next version of the language. Node version greater than `0.11.2` is required and needs to be executed with the `--harmony-generators` (or `--harmony`) command-line switch.

```js
Promise.spawn(function* () {
    var data = yield $.get("http://www.example.com");
    var moreUrls = data.split("\n");
    var contents = [];
    for( var i = 0, len = moreUrls.length; i < len; ++i ) {
        contents.push(yield $.get(moreUrls[i]));
    }
    return contents;
});
```

In the example is returned a promise that will eventually have the contents of the urls separated by newline on example.com.

Note that you need to try-catch normally in the generator function, any uncaught exception is immediately turned into a rejection on the returned promise. Yielding a promise that gets rejected causes a normal error inside the generator function.

**Tip:**

When `Promise.spawn` is called as a method of an object, that object becomes the receiver of the generator function too.

```js
function ChatRoom(roomId) {
    this.roomId = roomId
}
ChatRoom.prototype.spawn = Promise.spawn;

ChatRoom.prototype.addUser = function( userId ) {
    return this.spawn(function* () {
        var isBanned = yield chatStore.userIsBannedForRoom(this.roomId, userId);
        if (isBanned) {
            throw new ChatError("You have been banned from this room");
        }
        return chatStore.addUserToRoom(this.roomId, userId);
    });
};

var room = new ChatRoom(1);
room.addUser(2);
```

In the above example, all the methods of `ChatRoom` can avoid the `var self = this` prologue and just use `this` normally inside the generator.

**Tip**

If you yield an array then its elements are implicitly waited for.

You can combine it with ES6 destructing for some neat syntax:

```js
var getData = Promise.coroutine(function* (urlA, urlB) {
    [resultA, resultB] = yield [http.getAsync(urlA), http.getAsync(urlB)];
    //use resultA
    //use resultB
});
```

You might wonder why not just do this?

```js
var getData = Promise.coroutine(function* (urlA, urlB) {
    var resultA = yield http.getAsync(urlA);
    var resultB = yield http.getAsync(urlB);
});
```

The problem with the above is that the requests are not done in parallel. It will completely wait for request A to complete before even starting request B. In the array syntax both requests fire off at the same time in parallel.

<hr>

##Utility

Functions that could potentially be handy in some situations.

#####`.call(String propertyName [, dynamic arg...])` -> `Promise`

This is a convenience method for doing:

```js
promise.then(function(obj){
    return obj[propertyName].call(obj, arg...);
});
```

<hr>

#####`.get(String propertyName)` -> `Promise`

This is a convenience method for doing:

```js
promise.then(function(obj){
    return obj[propertyName];
});
```

<hr>

#####`.return(dynamic value)` -> `Promise`

Convenience method for:

```js
.then(function() {
   return value;
});
```

in the case where `value` doesn't change its value.

That means `value` is bound at the time of calling `.return()` so this will not work as expected:

```js
function getData() {
    var data;

    return query().then(function(result) {
        data = result;
    }).return(data);
}
```

because `data` is `undefined` at the time `.return` is called.

*For compatibility with earlier ECMAScript version, an alias `.thenReturn()` is provided for `.return()`.*

<hr>

#####`.throw(dynamic reason)` -> `Promise`

Convenience method for:

```js
.then(function() {
   throw reason;
});
```

Same limitations apply as with `.return()`.

*For compatibility with earlier ECMAScript version, an alias `.thenThrow()` is provided for `.throw()`.*

<hr>

#####`.toString()` -> `String`

<hr>

#####`.toJSON()` -> `Object`

This is implicitly called by `JSON.stringify` when serializing the object. Returns a serialized representation of the `Promise`.

<hr>

#####`Promise.noConflict()` -> `Object`

This is relevant to browser environments with no module loader.

Release control of the `Promise` namespace to whatever it was before this library was loaded. Returns a reference to the library namespace so you can attach it to something else.

```html
<!-- the other promise library must be loaded first -->
<script type="text/javascript" src="/scripts/other_promise.js"></script>
<script type="text/javascript" src="/scripts/bluebird_debug.js"></script>
<script type="text/javascript">
//Release control right after
var Bluebird = Promise.noConflict();

//Cast a promise from some other Promise library using the Promise namespace to Bluebird:
var promise = Bluebird.cast(new Promise());
</script>
```

<hr>

#####`Promise.onPossiblyUnhandledRejection(Function handler)` -> `undefined`

Add `handler` as the handler to call when there is a possibly unhandled rejection. The default handler logs the error stack to stderr or `console.error` in browsers.

```html
Promise.onPossiblyUnhandledRejection(function(e, promise){
    throw e;
});
```

Passing no value or a non-function will have the effect of removing any kind of handling for possibly unhandled rejections.

<hr>

##Collections

Methods of `Promise` instances and core static methods of the Promise class to deal with
collections of promises or mixed promises and values.

#####`.all()` -> `Promise`

Same as calling [Promise.all\(thisPromise\)](#promiseallarraydynamic-values---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.props()` -> `Promise`

Same as calling [Promise.props\(thisPromise\)](#promisepropsobject-object---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.settle()` -> `Promise`

Same as calling [Promise.settle\(thisPromise\)](#promisesettlearraydynamic-values---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.any()` -> `Promise`

Same as calling [Promise.any\(thisPromise\)](#promiseanyarraydynamic-values---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.race()` -> `Promise`

Same as calling [Promise.race\(thisPromise\)](#promiseracearraypromise-promises---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>


#####`.some(int count)` -> `Promise`

Same as calling [Promise.some\(thisPromise, count\)](#promisesomearraydynamic-values-int-count---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.spread([Function fulfilledHandler] [, Function rejectedHandler ])` -> `Promise`

Like calling `.then`, but the fulfillment value or rejection reason is assumed to be an array, which is flattened to the formal parameters of the handlers.

```js
Promise.all([task1, task2, task3]).spread(function(result1, result2, result3){

});
```

Normally when using `.then` the code would be like:

```js
Promise.all([task1, task2, task3]).then(function(results){
    var result1 = results[0];
    var result2 = results[1];
    var result3 = results[2];
});
```

This is useful when the `results` array contains items that are not conceptually items of the same list.

<hr>

#####`.map(Function mapper)` -> `Promise`

Same as calling [Promise.map\(thisPromise, mapper\)](#promisemaparraydynamic-values-function-mapper---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.reduce(Function reducer [, dynamic initialValue])` -> `Promise`

Same as calling [Promise.reduce\(thisPromise, Function reducer, initialValue\)](#promisereducearraydynamic-values-function-reducer--dynamic-initialvalue---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

<hr>

#####`.filter(Function filterer)` -> `Promise`

Same as calling [`Promise.filter(thisPromise, filterer)`](#promisefilterarraydynamicpromise-values-function-filterer---promise). With the exception that if this promise is [bound](#binddynamic-thisarg---promise) to a value, the returned promise is bound to that value too.

In this example, a list of websites are pinged with 100ms timeout. [`.settle()`](#settle---promise) is used to wait until all pings are either fulfilled or rejected. Then the settled
list of [`PromiseInspections`](#inspect---promiseinspection) is filtered for those that fulfilled (responded in under 100ms) and [`mapped`](#promisemaparraydynamicpromise-values-function-mapper---promise) to the actual fulfillment value.

```js
pingWebsitesAsync({timeout: 100}).settle()
.filter(function(inspection){
    return inspection.isFulfilled();
})
.map(function(inspection){
    return inspection.value();
})
.then(function(websites){
   //List of website names which answered
});
```

The above pattern is actually reusable and can be captured in a method:

```js
Promise.prototype.settledWithFulfill = function() {
    return this.settle()
        .filter(function(inspection){
            return inspection.isFulfilled();
        })
        .map(function(inspection){
            return inspection.value();
        });
};
```

<hr>

#####`Promise.all(Array<dynamic>|Promise values)` -> `Promise`

Given an array, or a promise of an array, which contains promises (or a mix of promises and values) return a promise that is fulfilled when all the items in the array are fulfilled. The promise's fulfillment value is an array with fulfillment values at respective positions to the original array. If any promise in the array rejects, the returned promise is rejected with the rejection reason.

In this example we create a promise that is fulfilled only when the pictures, comments and tweets are all loaded.

```js
Promise.all([getPictures(), getComments(), getTweets()]).then(function(results){
    //Everything loaded and good to go
    var pictures = results[0];
    var comments = results[1];
    var tweets = results[2];
}).catch(function(e){
    alertAsync("error when getting your stuff");
});
```

See [`.spread\(\)`](#spreadfunction-fulfilledhandler--function-rejectedhandler----promise) for a more convenient way to extract the fulfillment values.

*The original array is not modified. The input array sparsity is retained in the resulting array.*

<hr>

#####`Promise.props(Object|Promise object)` -> `Promise`

Like [`Promise.all`](#promiseallarraydynamic-values---promise) but for object properties instead of array items. Returns a promise that is fulfilled when all the properties of the object are fulfilled. The promise's fulfillment value is an object with fulfillment values at respective keys to the original object. If any promise in the object rejects, the returned promise is rejected with the rejection reason.

If `object` is a trusted `Promise`, then it will be treated as a promise for object rather than for its properties. All other objects are treated for their properties as is returned by `Object.keys` - the object's own enumerable properties.

```js
Promise.props({
    pictures: getPictures(),
    comments: getComments(),
    tweets: getTweets()
}).then(function(result){
    console.log(result.tweets, result.pictures, result.comments);
});
```

Note that if you have no use for the result object other than retrieving the properties, it is more convenient to use [`Promise.all`](#promiseallarraydynamic-values---promise) and [`.spread()`](#spreadfunction-fulfilledhandler--function-rejectedhandler----promise):

```js
Promise.all([getPictures(), getComments(), getTweets()])
.spread(function(pictures, comments, tweets) {
    console.log(pictures, comments, tweets);
});
```

*The original object is not modified.*

<hr>

#####`Promise.settle(Array<dynamic>|Promise values)` -> `Promise`

Given an array, or a promise of an array, which contains promises (or a mix of promises and values) return a promise that is fulfilled when all the items in the array are either fulfilled or rejected. The fulfillment value is an array of [`PromiseInspection`](#inspect---promiseinspection) instances at respective positions in relation to the input array.

*The original array is not modified. The input array sparsity is retained in the resulting array.*

<hr>

#####`Promise.any(Array<dynamic>|Promise values)` -> `Promise`

Like [`Promise.some\(\)`](#someint-count---promise), with 1 as `count`. However, if the promise fulfills, the fulfillment value is not an array of 1 but the value directly.

<hr>

#####`Promise.race(Array|Promise promises)` -> `Promise`

Given an array, or a promise of an array, which contains promises (or a mix of promises and values) return a promise that is fulfilled or rejected as soon as a promise in the array is fulfilled or rejected with the respective rejection reason or fulfillment value.

Example of implementing a timeout in terms of `Promise.race`:

```js
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));

function delay(ms) {
    return new Promise(function (v) {
        setTimeout(v, ms);
    });
}

function timeout(promise, time) {
    var timeout = delay(time).then(function () {
        throw new Promise.TimeoutError("Operation timed out after " + time + " ms");
    });

    return Promise.race([promise, timeout]);
}

timeout(fs.readFileAsync("slowfile.txt"), 300).then(function (contents) {
    console.log("Here are the contents", contents);
}).
catch(Promise.TimeoutError, function (e) {
    console.error("Sorry retrieving file took too long");
});
```

**Note** If you pass empty array or a sparse array with no values, or a promise/thenable for such, it will be forever pending.

<hr>

#####`Promise.some(Array<dynamic>|Promise values, int count)` -> `Promise`

Initiate a competetive race between multiple promises or values (values will become immediately fulfilled promises). When `count` amount of promises have been fulfilled, the returned promise is fulfilled with an array that contains the fulfillment values of the winners in order of resolution.

This example pings 4 nameservers, and logs the fastest 2 on console:

```js
Promise.some([
    ping("ns1.example.com"),
    ping("ns2.example.com"),
    ping("ns3.example.com"),
    ping("ns4.example.com")
], 2).spread(function(first, second) {
    console.log(first, second);
});
```

If too many promises are rejected so that the promise can never become fulfilled, it will be immediately rejected with an array of rejection reasons in the order they were thrown in.

*The original array is not modified.*

<hr>

#####`Promise.join([dynamic value...])` -> `Promise`

Like [`Promise.all\(\)`](#promiseallarraydynamic-values---promise) but instead of having to pass an array, the array is generated from the passed variadic arguments.

So instead of:

```js
Promise.all([a, b]).spread(function(aResult, bResult) {

});
```

You can do:

```js
Promise.join(a, b).spread(function(aResult, bResult) {

});
```

<hr>

#####`Promise.map(Array<dynamic>|Promise values, Function mapper)` -> `Promise`

Map an array, or a promise of an array, which contains a promises (or a mix of promises and values) with the given `mapper` function with the signature `(item, index, arrayLength)` where `item` is the resolved value of a respective promise in the input array. If any promise in the input array is rejected the returned promise is rejected as well.

If the `mapper` function returns promises or thenables, the returned promise will wait for all the mapped results to be resolved as well.

*(TODO: an example where this is useful)*

*The original array is not modified.*

<hr>

#####`Promise.reduce(Array<dynamic>|Promise values, Function reducer [, dynamic initialValue])` -> `Promise`

Reduce an array, or a promise of an array, which contains a promises (or a mix of promises and values) with the given `reducer` function with the signature `(total, current, index, arrayLength)` where `item` is the resolved value of a respective promise in the input array. If any promise in the input array is rejected the returned promise is rejected as well.

If the reducer function returns a promise or a thenable, the result for the promise is awaited for before continuing with next iteration.

Read given files sequentially while summing their contents as an integer. Each file contains just the text `10`.

```js
Promise.reduce(["file1.txt", "file2.txt", "file3.txt"], function(total, fileName) {
    return fs.readFileAsync(fileName, "utf8").then(function(contents) {
        return total + parseInt(contents, 10);
    });
}, 0).then(function(total) {
    //Total is 30
});
```

*The original array is not modified. If `intialValue` is `undefined` (or a promise that resolves to `undefined`) and the array contains only 1 item, the callback will not be called and `undefined` is returned. If the array is empty, the callback will not be called and `initialValue` is returned (which may be `undefined`).*

<hr>

#####`Promise.filter(Array<dynamic>|Promise values, Function filterer)` -> `Promise`

Filter an array, or a promise of an array, which contains a promises (or a mix of promises and values) with the given `filterer` function with the signature `(item, index, arrayLength)` where `item` is the resolved value of a respective promise in the input array. If any promise in the input array is rejected the returned promise is rejected as well.

The return values from the filtered functions are coerced to booleans, with the exception of promises and thenables which are awaited for their eventual result.

[See the instance method `.filter()` for an example.](#filterfunction-filterer---promise)

*The original array is not modified.

<hr>
,,{
  "name": "bluebird",
  "version": "1.0.0",
  "homepage": "https://github.com/petkaantonov/bluebird",
  "authors": [
    "Petka Antonov <petka_antonov@hotmail.com>"
  ],
  "description": "Bluebird is a full featured promise library with unmatched performance.",
  "main": "js/browser/bluebird.js",
  "license": "MIT",
  "ignore": [
    "**/.*",
    "benchmark",
    "bower_components",
    "./browser",
    "js/zalgo",
    "node_modules",
    "test"
  ],
  "keywords": [
    "promise",
    "performance",
    "promises",
    "promises-a",
    "promises-aplus",
    "async",
    "await",
    "deferred",
    "deferreds",
    "future",
    "flow control",
    "dsl",
    "fluent interface"
  ]
}
,[![Build Status](https://travis-ci.org/petkaantonov/bluebird.png?branch=master)](https://travis-ci.org/petkaantonov/bluebird)

<a href="http://promisesaplus.com/">
    <img src="http://promisesaplus.com/assets/logo-small.png" alt="Promises/A+ logo"
         title="Promises/A+ 1.0 compliant" align="right" />
</a>

#Introduction

Bluebird is a fully featured [promise](#what-are-promises-and-why-should-i-use-them) library with focus on innovative features and performance.

#Topics

- [Features](#features)
- [Quick start](#quick-start)
- [API Reference and examples](https://github.com/petkaantonov/bluebird/blob/master/API.md)
- [What are promises and why should I use them?](#what-are-promises-and-why-should-i-use-them)
- [Error handling](#error-handling)
- [Development](#development)
    - [Testing](#testing)
    - [Benchmarking](#benchmarks)
    - [Custom builds](#custom-builds)
    - [For library authors](#for-library-authors)
- [What is the sync build?](#what-is-the-sync-build)
- [License](#license)
- [Snippets for common problems](https://github.com/petkaantonov/bluebird/wiki/Snippets)
- [Promise anti-patterns](https://github.com/petkaantonov/bluebird/wiki/Promise-anti-patterns)
- [Changelog](https://github.com/petkaantonov/bluebird/blob/master/changelog.md)
- [Optimization guide](#optimization-guide)

#Features:

- [Promises A+ 2.0.2](http://promisesaplus.com)
- [Cancellation](https://github.com/promises-aplus)
- [Progression](https://github.com/promises-aplus/progress-spec)
- [Synchronous inspection](https://github.com/promises-aplus/synchronous-inspection-spec)
- [`.bind`](https://github.com/petkaantonov/bluebird/blob/master/API.md#binddynamic-thisarg---promise)
- [Complete parallel for C# 5.0 async and await](https://github.com/petkaantonov/bluebird/blob/master/API.md#promisecoroutinegeneratorfunction-generatorfunction---function)
- [Collection methods](https://github.com/petkaantonov/bluebird/blob/master/API.md#collections) such as All, any, some, settle, map, filter, reduce, spread, join, race...
- [Practical debugging solutions](#error-handling) such as unhandled rejection reporting, typed catches, catching only what you expect and very long, relevant stack traces without losing perf
- [Sick performance](https://github.com/petkaantonov/bluebird/tree/master/benchmark/stats)

Passes [AP2](https://github.com/petkaantonov/bluebird/tree/master/test/mocha), [AP3](https://github.com/petkaantonov/bluebird/tree/master/test/mocha), [Cancellation](https://github.com/petkaantonov/bluebird/blob/master/test/mocha/cancel.js), [Progress](https://github.com/petkaantonov/bluebird/blob/master/test/mocha/q_progress.js) tests and more. See [testing](#testing).

<hr>

#Quick start

##Node.js

    npm install bluebird

Then:

```js
var Promise = require("bluebird");
```

##Browsers

Download the [bluebird.js](https://github.com/petkaantonov/bluebird/tree/master/js/browser) file. And then use a script tag:

```html
<script type="text/javascript" src="/scripts/bluebird.js"></script>
```

The global variable `Promise` becomes available after the above script tag.

####Browser support

Browsers that [implement ECMA-262, edition 3](http://en.wikipedia.org/wiki/Ecmascript#Implementations) and later are supported.

[![Selenium Test Status](https://saucelabs.com/browser-matrix/petka_antonov.svg)](https://saucelabs.com/u/petka_antonov)

**Note** that in ECMA-262, edition 3 (IE7, IE8 etc) it is not possible to use methods that have keyword names like `.catch` and `.finally`. The [API documentation](https://github.com/petkaantonov/bluebird/blob/master/API.md) always lists a compatible alternative name that you can use if you need to support these browsers. For example `.catch` is replaced with `.caught` and `.finally` with `.lastly`.

Also, [long stack trace](https://github.com/petkaantonov/bluebird/blob/master/API.md#promiselongstacktraces---void) support is only available in Chrome and Firefox.

<sub>Previously bluebird required es5-shim.js and es5-sham.js to support Edition 3 - these are **no longer required** as of **0.10.4**.</sub>

After quick start, see [API Reference and examples](https://github.com/petkaantonov/bluebird/blob/master/API.md)

<hr>

#What are promises and why should I use them?

You should use promises to turn this:

```js
readFile("file.json", function(err, val) {
    if( err ) {
        console.error("unable to read file");
    }
    else {
        try {
            val = JSON.parse(val);
            console.log(val.success);
        }
        catch( e ) {
            console.error("invalid json in file");
        }
    }
});
```

Into this:

```js
readFile("file.json").then(JSON.parse).then(function(val) {
    console.log(val.success);
})
.catch(SyntaxError, function(e) {
    console.error("invalid json in file");
})
.catch(function(e){
    console.error("unable to read file")
});
```

Actually you might notice the latter has a lot in common with code that would do the same using synchronous I/O:

```js
try {
    var val = JSON.parse(readFile("file.json"));
    console.log(val.success);
}
//Syntax actually not supported in JS but drives the point
catch(SyntaxError e) {
    console.error("invalid json in file");
}
catch(Error e) {
    console.error("unable to read file")
}
```

And that is the point - being able to have something that is a lot like `return` and `throw` in synchronous code.

You can also use promises to improve code that was written with callback helpers:


```js
//Copyright Plato http://stackoverflow.com/a/19385911/995876
//CC BY-SA 2.5
mapSeries(URLs, function (URL, done) {
    var options = {};
    needle.get(URL, options, function (error, response, body) {
        if (error) {
            return done(error)
        }
        try {
            var ret = JSON.parse(body);
            return done(null, ret);
        }
        catch (e) {
            done(e);
        }
    });
}, function (err, results) {
    if (err) {
        console.log(err)
    } else {
        console.log('All Needle requests successful');
        // results is a 1 to 1 mapping in order of URLs > needle.body
        processAndSaveAllInDB(results, function (err) {
            if (err) {
                return done(err)
            }
            console.log('All Needle requests saved');
            done(null);
        });
    }
});
```

Is more pleasing to the eye when done with promises:

```js
Promise.promisifyAll(needle);
var options = {};

var current = Promise.resolve();
Promise.map(URLs, function(URL) {
    current = current.then(function () {
        return needle.getAsync(URL, options);
    });
    return current;
}).map(function(responseAndBody){
    return JSON.parse(responseAndBody[1]);
}).then(function (results) {
    return processAndSaveAllInDB(results);
}).then(function(){
    console.log('All Needle requests saved');
}).catch(function (e) {
    console.log(e);
});
```

Also promises don't just give you correspondences for synchronous features but can also be used as limited event emitters or callback aggregators.

More reading:

 - [Promise nuggets](http://spion.github.io/promise-nuggets/)
 - [Why I am switching to promises](http://spion.github.io/posts/why-i-am-switching-to-promises.html)
 - [What is the the point of promises](http://domenic.me/2012/10/14/youre-missing-the-point-of-promises/#toc_1)
 - [Snippets for common problems](https://github.com/petkaantonov/bluebird/wiki/Snippets)
 - [Promise anti-patterns](https://github.com/petkaantonov/bluebird/wiki/Promise-anti-patterns)

#Error handling

This is a problem every promise library needs to handle in some way. Unhandled rejections/exceptions don't really have a good agreed-on asynchronous correspondence. The problem is that it is impossible to predict the future and know if a rejected promise will eventually be handled.

There are two common pragmatic attempts at solving the problem that promise libraries do.

The more popular one is to have the user explicitly communicate that they are done and any unhandled rejections should be thrown, like so:

```js
download().then(...).then(...).done();
```

For handling this problem, in my opinion, this is completely unacceptable and pointless. The user must remember to explicitly call `.done` and that cannot be justified when the problem is forgetting to create an error handler in the first place.

The second approach, which is what bluebird by default takes, is to call a registered handler if a rejection is unhandled by the start of a second turn. The default handler is to write the stack trace to stderr or `console.error` in browsers. This is close to what happens with synchronous code - your code doens't work as expected and you open console and see a stack trace. Nice.

Of course this is not perfect, if your code for some reason needs to swoop in and attach error handler to some promise after the promise has been hanging around a while then you will see annoying messages. In that case you can use the `.done()` method to signal that any hanging exceptions should be thrown.

If you want to override the default handler for these possibly unhandled rejections, you can pass yours like so:

```js
Promise.onPossiblyUnhandledRejection(function(error){
    throw error;
});
```

If you want to also enable long stack traces, call:

```js
Promise.longStackTraces();
```

right after the library is loaded.

In node.js use the environment flag `BLUEBIRD_DEBUG`:

```
BLUEBIRD_DEBUG=1 node server.js
```

to enable long stack traces in all instances of bluebird.

Long stack traces cannot be disabled after being enabled, and cannot be enabled after promises have alread been created. Long stack traces imply a substantial performance penalty, even after using every trick to optimize them.

Long stack traces are enabled by default in the debug build.

####Expected and unexpected errors

A practical problem with Promises/A+ is that it models Javascript `try-catch` too closely for its own good. Therefore by default promises inherit `try-catch` warts such as the inability to specify the error types that the catch block is eligible for. It is an anti-pattern in every other language to use catch-all handlers because they swallow exceptions that you might not know about.

Now, Javascript does have a perfectly fine and working way of creating error type hierarchies. It is still quite awkward to use them with the built-in `try-catch` however:

```js
try {
    //code
}
catch(e) {
    if( e instanceof WhatIWantError) {
        //handle
    }
    else {
        throw e;
    }
}
```

Without such checking, unexpected errors would be silently swallowed. However, with promises, bluebird brings the future (hopefully) here now and extends the `.catch` to [accept potential error type eligibility](https://github.com/petkaantonov/bluebird/blob/master/API.md#catchfunction-errorclass-function-handler---promise).

For instance here it is expected that some evil or incompetent entity will try to crash our server from `SyntaxError` by providing syntactically invalid JSON:

```js
getJSONFromSomewhere().then(function(jsonString) {
    return JSON.parse(jsonString);
}).then(function(object) {
    console.log("it was valid json: ", object);
}).catch(SyntaxError, function(e){
    console.log("don't be evil");
});
```

Here any kind of unexpected error will automatically reported on stderr along with a stack trace because we only register a handler for the expected `SyntaxError`.

Ok, so, that's pretty neat. But actually not many libraries define error types and it is in fact a complete ghetto out there with ad hoc strings being attached as some arbitrary property name like `.name`, `.type`, `.code`, not having any property at all or even throwing strings as errors and so on. So how can we still listen for expected errors?

Bluebird defines a special error type `RejectionError` (you can get a reference from `Promise.RejectionError`). This type of error is given as rejection reason by promisified methods when
their underlying library gives an untyped, but expected error. Primitives such as strings, and error objects that are directly created like `new Error("database didn't respond")` are considered untyped.

Example of such library is the node core library `fs`. So if we promisify it, we can catch just the errors we want pretty easily and have programmer errors be redirected to unhandled rejection handler so that we notice them:

```js
//Read more about promisification in the API Reference:
//https://github.com/petkaantonov/bluebird/blob/master/API.md
var fs = Promise.promisifyAll(require("fs"));

fs.readFileAsync("myfile.json").then(JSON.parse).then(function (json) {
    console.log("Successful json")
}).catch(SyntaxError, function (e) {
    console.error("file contains invalid json");
}).catch(Promise.RejectionError, function (e) {
    console.error("unable to read file, because: ", e.message);
});
```

The last `catch` handler is only invoked when the `fs` module explicitly used the `err` argument convention of async callbacks to inform of an expected error. The `RejectionError` instance will contain the original error in its `.cause` property but it does have a direct copy of the `.message` and `.stack` too. In this code any unexpected error - be it in our code or the `fs` module - would not be caught by these handlers and therefore not swallowed.

Since a `catch` handler typed to `Promise.RejectionError` is expected to be used very often, it has a neat shorthand:

```js
.error(function (e) {
    console.error("unable to read file, because: ", e.message);
});
```

See [API documentation for `.error()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#error-rejectedhandler----promise)

Finally, Bluebird also supports predicate-based filters. If you pass a
predicate function instead of an error type, the predicate will receive
the error as an argument. The return result will be used determine whether
the error handler should be called.

Predicates should allow for very fine grained control over caught errors:
pattern matching, error typesets with set operations and many other techniques
can be implemented on top of them.

Example of using a predicate-based filter:

```js
var Promise = require("bluebird");
var request = Promise.promisify(require("request"));

function clientError(e) {
    return e.code >= 400 && e.code < 500;
}

request("http://www.google.com").then(function(contents){
    console.log(contents);
}).catch(clientError, function(e){
   //A client error like 400 Bad Request happened
});
```

**Danger:** The JavaScript language allows throwing primitive values like strings. Throwing primitives can lead to worse or no stack traces. Primitives [are not exceptions](http://www.devthought.com/2011/12/22/a-string-is-not-an-error/). You should consider always throwing Error objects when handling exceptions.

<hr>

####How do long stack traces differ from e.g. Q?

Bluebird attempts to have more elaborate traces. Consider:

```js
Error.stackTraceLimit = 25;
Q.longStackSupport = true;
Q().then(function outer() {
    return Q().then(function inner() {
        return Q().then(function evenMoreInner() {
            a.b.c.d();
        }).catch(function catcher(e){
            console.error(e.stack);
        });
    })
});
```

You will see

    ReferenceError: a is not defined
        at evenMoreInner (<anonymous>:7:13)
    From previous event:
        at inner (<anonymous>:6:20)

Compare to:

```js
Error.stackTraceLimit = 25;
Promise.longStackTraces();
Promise.resolve().then(function outer() {
    return Promise.resolve().then(function inner() {
        return Promise.resolve().then(function evenMoreInner() {
            a.b.c.d()
        }).catch(function catcher(e){
            console.error(e.stack);
        });
    });
});
```

    ReferenceError: a is not defined
        at evenMoreInner (<anonymous>:7:13)
    From previous event:
        at inner (<anonymous>:6:36)
    From previous event:
        at outer (<anonymous>:5:32)
    From previous event:
        at <anonymous>:4:21
        at Object.InjectedScript._evaluateOn (<anonymous>:572:39)
        at Object.InjectedScript._evaluateAndWrap (<anonymous>:531:52)
        at Object.InjectedScript.evaluate (<anonymous>:450:21)


A better and more practical example of the differences can be seen in gorgikosev's [debuggability competition](https://github.com/spion/async-compare#debuggability).

<hr>

####Can I use long stack traces in production?

Probably yes. Bluebird uses multiple innovative techniques to optimize long stack traces. Even with long stack traces, it is still way faster than similarly featured implementations that don't have long stack traces enabled and about same speed as minimal implementations. A slowdown of 4-5x is expected, not 50x.

What techniques are used?

#####V8 API second argument

This technique utilizes the [slightly under-documented](https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi#Stack_trace_collection_for_custom_exceptions) second argument of V8 `Error.captureStackTrace`. It turns out that the second argument can actually be used to make V8 skip all library internal stack frames [for free](https://github.com/v8/v8/blob/b5fabb9225e1eb1c20fd527b037e3f877296e52a/src/isolate.cc#L665). It only requires propagation of callers manually in library internals but this is not visible to you as user at all.

Without this technique, every promise (well not every, see second technique) created would have to waste time creating and collecting library internal frames which will just be thrown away anyway. It also allows one to use smaller stack trace limits because skipped frames are not counted towards the limit whereas with collecting everything upfront and filtering afterwards would likely have to use higher limits to get more user stack frames in.

#####Sharing stack traces

Consider:

```js
function getSomethingAsync(fileName) {
    return readFileAsync(fileName).then(function(){
        //...
    }).then(function() {
        //...
    }).then(function() {
        //...
    });
}
```

Everytime you call this function it creates 4 promises and in a straight-forward long stack traces implementation it would collect 4 almost identical stack traces. Bluebird has a light weight internal data-structure (kcnown as context stack in the source code) to help tracking when traces can be re-used and this example would only collect one trace.

#####Lazy formatting

After a stack trace has been collected on an object, one must be careful not to reference the `.stack` property until necessary. Referencing the property causes
an expensive format call and the stack property is turned into a string which uses much more memory.

What about [Q #111](https://github.com/kriskowal/q/issues/111)?

Long stack traces is not inherently the problem. For example with latest Q with stack traces disabled:

```js
var Q = require("q");


function test(i){
    if (i <= 0){
       return Q.when('done')
   } else {
       return Q.when(i-1).then(test)
   }
}
test(1000000000).then(function(output){console.log(output) });
```

After 2 minutes of running this, it will give:

```js
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - process out of memory
```

So the problem with this is how much absolute memory is used per promise - not whether long traces are enabled or not.

For some purpose, let's say 100000 parallel pending promises in memory at the same time is the maximum. You would then roughly use 100MB for them instead of 10MB with stack traces disabled.For comparison, just creating 100000 functions alone will use 14MB if they're closures. All numbers can be halved for 32-bit node.

<hr>

#Development

For development tasks such as running benchmarks or testing, you need to clone the repository and install dev-dependencies.

Install [node](http://nodejs.org/), [npm](https://npmjs.org/), and [grunt](http://gruntjs.com/).

    git clone git@github.com:petkaantonov/bluebird.git
    cd bluebird
    npm install

##Testing

To run all tests, run `grunt test`. Note that 10 processes are created to run the tests in parallel. The stdout of tests is ignored by default and everything will stop at the first failure.

Individual files can be run with `grunt test --run=filename` where `filename` is a test file name in `/test` folder or `/test/mocha` folder. The `.js` prefix is not needed. The dots for AP compliance tests are not needed, so to run `/test/mocha/2.3.3.js` for instance:

    grunt test --run=233

When trying to get a test to pass, run only that individual test file with `--verbose` to see the output from that test:

    grunt test --run=233 --verbose

The reason for the unusual way of testing is because the majority of tests are from different libraries using different testing frameworks and because it takes forever to test sequentially.


###Testing in browsers

To test in browsers:

    cd browser
    setup

Then open the `index.html` in your browser. Requires bash (on windows the mingw32 that comes with git works fine too).

You may also [visit the github hosted page](http://petkaantonov.github.io/bluebird/browser/).

Keep the test tab active because some tests are timing-sensitive and will fail if the browser is throttling timeouts. Chrome will do this for example when the tab is not active.

##Benchmarks

To run a benchmark, run the given command for a benchmark while on the project root. Requires bash (on windows the mingw32 that comes with git works fine too).

Node 0.11.2+ is required to run the generator examples.

###1\. DoxBee sequential

Currently the most relevant benchmark is @gorkikosev's benchmark in the article [Analysis of generators and other async patterns in node](http://spion.github.io/posts/analysis-generators-and-other-async-patterns-node.html). The benchmark emulates a situation where n amount of users are making a request in parallel to execute some mixed async/sync action. The benchmark has been modified to include a warm-up phase to minimize any JITing during timed sections.

Command: `bench doxbee`

###2\. Made-up parallel

This made-up scenario runs 15 shimmed queries in parallel.

Command: `bench parallel`

##Custom builds

Custom builds for browsers are supported through a command-line utility.




<table>
    <caption>The following features can be disabled</caption>
    <thead>
        <tr>
            <th>Feature(s)</th>
            <th>Command line identifier</th>
        </tr>
    </thead>
    <tbody>

        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#any---promise"><code>.any</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promiseanyarraydynamicpromise-values---promise"><code>Promise.any</code></a></td><td><code>any</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#race---promise"><code>.race</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promiseracearraypromise-promises---promise"><code>Promise.race</code></a></td><td><code>race</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#callstring-propertyname--dynamic-arg---promise"><code>.call</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#getstring-propertyname---promise"><code>.get</code></a></td><td><code>call_get</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#filterfunction-filterer---promise"><code>.filter</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisefilterarraydynamicpromise-values-function-filterer---promise"><code>Promise.filter</code></a></td><td><code>filter</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#mapfunction-mapper---promise"><code>.map</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisemaparraydynamicpromise-values-function-mapper---promise"><code>Promise.map</code></a></td><td><code>map</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#reducefunction-reducer--dynamic-initialvalue---promise"><code>.reduce</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisereducearraydynamicpromise-values-function-reducer--dynamic-initialvalue---promise"><code>Promise.reduce</code></a></td><td><code>reduce</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#props---promise"><code>.props</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisepropsobjectpromise-object---promise"><code>Promise.props</code></a></td><td><code>props</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#settle---promise"><code>.settle</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisesettlearraydynamicpromise-values---promise"><code>Promise.settle</code></a></td><td><code>settle</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#someint-count---promise"><code>.some</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisesomearraydynamicpromise-values-int-count---promise"><code>Promise.some</code></a></td><td><code>some</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#nodeifyfunction-callback---promise"><code>.nodeify</code></a></td><td><code>nodeify</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisecoroutinegeneratorfunction-generatorfunction---function"><code>Promise.coroutine</code></a> and <a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisespawngeneratorfunction-generatorfunction---promise"><code>Promise.spawn</code></a></td><td><code>generators</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#progression">Progression</a></td><td><code>progress</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#promisification">Promisification</a></td><td><code>promisify</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#cancellation">Cancellation</a></td><td><code>cancel</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#synchronous-inspection">Synchronous inspection</a></td><td><code>synchronous_inspection</code></td></tr>
        <tr><td><a href="https://github.com/petkaantonov/bluebird/blob/master/API.md#timers">Timers</a></td><td><code>timers</code></td></tr>

    </tbody>
</table>


Make sure you have cloned the repo somewhere and did `npm install` successfully.

After that you can run:

    grunt build --features="core"


The above builds the most minimal build you can get. You can add more features separated by spaces from the above list:

    grunt build --features="core filter map reduce"

The custom build file will be found from `/js/browser/bluebird.js`. It will have a comment that lists the disabled and enabled features.

Note that the build leaves the `/js/main` etc folders with same features so if you use the folder for node.js at the same time, don't forget to build
a full version afterwards (after having taken a copy of the bluebird.js somewhere):

    grunt build

<hr>

##For library authors

Building a library that depends on bluebird? You should know about a few features.

If your library needs to do something obtrusive like adding or modifying methods on the `Promise` prototype, uses long stack traces or uses a custom unhandled rejection handler then... that's totally ok as long as you don't use `require("bluebird")`. Instead you should create a file
that creates an isolated copy. For example, creating a file called `bluebird-extended.js` that contains:

```js
                //NOTE the function call right after
module.exports = require("bluebird/js/main/promise")();
```

Your library can then use `var Promise = require("bluebird-extended");` and do whatever it wants with it. Then if the application or other library uses their own bluebird promises they will all play well together because of Promises/A+ thenable assimilation magic.

You should also know about [`.nodeify()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#nodeifyfunction-callback---promise) which makes it easy to provide a dual callback/promise API.

<hr>

##What is the sync build?

You may now use sync build by:

    var Promise = require("bluebird/zalgo");

The sync build is provided to see how forced asynchronity affects benchmarks. It should not be used in real code due to the implied hazards.

The normal async build gives Promises/A+ guarantees about asynchronous resolution of promises. Some people think this affects performance or just plain love their code having a possibility
of stack overflow errors and non-deterministic behavior.

The sync build skips the async call trampoline completely, e.g code like:

    async.invoke( this.fn, this, val );

Appears as this in the sync build:

    this.fn(val);

This should pressure the CPU slightly less and thus the sync build should perform better. Indeed it does, but only marginally. The biggest performance boosts are from writing efficient Javascript, not from compromising determinism.

Note that while some benchmarks are waiting for the next event tick, the CPU is actually not in use during that time. So the resulting benchmark result is not completely accurate because on node.js you only care about how much the CPU is taxed. Any time spent on CPU is time the whole process (or server) is paralyzed. And it is not graceful like it would be with threads.


```js
var cache = new Map(); //ES6 Map or DataStructures/Map or whatever...
function getResult(url) {
    var resolver = Promise.pending();
    if (cache.has(url)) {
        resolver.resolve(cache.get(url));
    }
    else {
        http.get(url, function(err, content) {
            if (err) resolver.reject(err);
            else {
                cache.set(url, content);
                resolver.resolve(content);
            }
        });
    }
    return resolver.promise;
}



//The result of console.log is truly random without async guarantees
function guessWhatItPrints( url ) {
    var i = 3;
    getResult(url).then(function(){
        i = 4;
    });
    console.log(i);
}
```

#Optimization guide

Articles about optimization will be periodically posted in [the wiki section](https://github.com/petkaantonov/bluebird/wiki), polishing edits are welcome.

A single cohesive guide compiled from the articles will probably be done eventually.

#License

Copyright (c) 2014 Petka Antonov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:</p>

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
,,## 1.0.4 (2014-02-09)

Features:

 - Possibly unhandled rejection handler will always get a stack trace, even if the rejection or thrown error was not an error
 - Unhandled rejections are tracked per promise, not per error. So if you create multiple branches from a single ancestor and that ancestor gets rejected, each branch with no error handler with the end will cause a possibly unhandled rejection handler invocation

Bugfixes:

 - Fix unhandled non-writable objects or primitives not reported by possibly unhandled rejection handler

## 1.0.3 (2014-02-05)

Bugfixes:

 - [#93](https://github.com/petkaantonov/bluebird/issues/88)

## 1.0.2 (2014-02-04)

Features:

 - Significantly improve performance of foreign bluebird thenables

Bugfixes:

 - [#88](https://github.com/petkaantonov/bluebird/issues/88)

## 1.0.1 (2014-01-28)

Features:

 - Error objects that have property `.isAsync = true` will now be caught by `.error()`

Bugfixes:

 - Fix TypeError and RangeError shims not working without `new` operator

## 1.0.0 (2014-01-12)

Features:

 - `.filter`, `.map`, and `.reduce` no longer skip sparse array holes. This is a backwards incompatible change.
 - Like `.map` and `.filter`, `.reduce` now allows returning promises and thenables from the iteration function.

Bugfixes:

 - [#58](https://github.com/petkaantonov/bluebird/issues/58)
 - [#61](https://github.com/petkaantonov/bluebird/issues/61)
 - [#64](https://github.com/petkaantonov/bluebird/issues/64)
 - [#60](https://github.com/petkaantonov/bluebird/issues/60)

## 0.11.6-1 (2013-12-29)

## 0.11.6-0 (2013-12-29)

Features:

 - You may now return promises and thenables from the filterer function used in `Promise.filter` and `Promise.prototype.filter`.

 - `.error()` now catches additional sources of rejections:

    - Rejections originating from `Promise.reject`

    - Rejections originating from thenables using
    the `reject` callback

    - Rejections originating from promisified callbacks
    which use the `errback` argument

    - Rejections originating from `new Promise` constructor
    where the `reject` callback is called explicitly

    - Rejections originating from `PromiseResolver` where
    `.reject()` method is called explicitly

Bugfixes:

 - Fix `captureStackTrace` being called when it was `null`
 - Fix `Promise.map` not unwrapping thenables

## 0.11.5-1 (2013-12-15)

## 0.11.5-0 (2013-12-03)

Features:

 - Improve performance of collection methods
 - Improve performance of promise chains

## 0.11.4-1 (2013-12-02)

## 0.11.4-0 (2013-12-02)

Bugfixes:

 - Fix `Promise.some` behavior with arguments like negative integers, 0...
 - Fix stack traces of synchronously throwing promisified functions'

## 0.11.3-0 (2013-12-02)

Features:

 - Improve performance of generators

Bugfixes:

 - Fix critical bug with collection methods.

## 0.11.2-0 (2013-12-02)

Features:

 - Improve performance of all collection methods

## 0.11.1-0 (2013-12-02)

Features:

- Improve overall performance.
- Improve performance of promisified functions.
- Improve performance of catch filters.
- Improve performance of .finally.

Bugfixes:

- Fix `.finally()` rejecting if passed non-function. It will now ignore non-functions like `.then`.
- Fix `.finally()` not converting thenables returned from the handler to promises.
- `.spread()` now rejects if the ultimate value given to it is not spreadable.

## 0.11.0-0 (2013-12-02)

Features:

 - Improve overall performance when not using `.bind()` or cancellation.
 - Promises are now not cancellable by default. This is backwards incompatible change - see [`.cancellable()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#cancellable---promise)
 - [`Promise.delay`](https://github.com/petkaantonov/bluebird/blob/master/API.md#promisedelaydynamic-value-int-ms---promise)
 - [`.delay()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#delayint-ms---promise)
 - [`.timeout()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#timeoutint-ms--string-message---promise)

## 0.10.14-0 (2013-12-01)

Bugfixes:

 - Fix race condition when mixing 3rd party asynchrony.

## 0.10.13-1 (2013-11-30)

## 0.10.13-0 (2013-11-30)

Bugfixes:

 - Fix another bug with progression.

## 0.10.12-0 (2013-11-30)

Bugfixes:

 - Fix bug with progression.

## 0.10.11-4 (2013-11-29)

## 0.10.11-2 (2013-11-29)

Bugfixes:

 - Fix `.race()` not propagating bound values.

## 0.10.11-1 (2013-11-29)

Features:

 - Improve performance of `Promise.race`

## 0.10.11-0 (2013-11-29)

Bugfixes:

 - Fixed `Promise.promisifyAll` invoking property accessors. Only data properties with function values are considered.

## 0.10.10-0 (2013-11-28)

Features:

 - Disable long stack traces in browsers by default. Call `Promise.longStackTraces()` to enable them.

## 0.10.9-1 (2013-11-27)

Bugfixes:

 - Fail early when `new Promise` is constructed incorrectly

## 0.10.9-0 (2013-11-27)

Bugfixes:

 - Promise.props now takes a [thenable-for-collection](https://github.com/petkaantonov/bluebird/blob/f41edac61b7c421608ff439bb5a09b7cffeadcf9/test/mocha/props.js#L197-L217)
 - All promise collection methods now reject when a promise-or-thenable-for-collection turns out not to give a collection

## 0.10.8-0 (2013-11-25)

Features:

 - All static collection methods take thenable-for-collection

## 0.10.7-0 (2013-11-25)

Features:

 - throw TypeError when thenable resolves with itself
 - Make .race() and Promise.race() forever pending on empty collections

## 0.10.6-0 (2013-11-25)

Bugfixes:

 - Promise.resolve and PromiseResolver.resolve follow thenables too.

## 0.10.5-0 (2013-11-24)

Bugfixes:

 - Fix infinite loop when thenable resolves with itself

## 0.10.4-1 (2013-11-24)

Bugfixes:

 - Fix a file missing from build. (Critical fix)

## 0.10.4-0 (2013-11-24)

Features:

 - Remove dependency of es5-shim and es5-sham when using ES3.

## 0.10.3-0 (2013-11-24)

Features:

 - Improve performance of `Promise.method`

## 0.10.2-1 (2013-11-24)

Features:

 - Rename PromiseResolver#asCallback to PromiseResolver#callback

## 0.10.2-0 (2013-11-24)

Features:

 - Remove memoization of thenables

## 0.10.1-0 (2013-11-21)

Features:

 - Add methods `Promise.resolve()`, `Promise.reject()`, `Promise.defer()` and `.resolve()`.

## 0.10.0-1 (2013-11-17)

## 0.10.0-0 (2013-11-17)

Features:

 - Implement `Promise.method()`
 - Implement `.return()`
 - Implement `.throw()`

Bugfixes:

 - Fix promises being able to use themselves as resolution or follower value

## 0.9.11-1 (2013-11-14)

Features:

 - Implicit `Promise.all()` when yielding an array from generators

## 0.9.11-0 (2013-11-13)

Bugfixes:

 - Fix `.spread` not unwrapping thenables

## 0.9.10-2 (2013-11-13)

Features:

 - Improve performance of promisified functions on V8

Bugfixes:

 - Report unhandled rejections even when long stack traces are disabled
 - Fix `.error()` showing up in stack traces

## 0.9.10-1 (2013-11-05)

Bugfixes:

 - Catch filter method calls showing in stack traces

## 0.9.10-0 (2013-11-05)

Bugfixes:

 - Support primitives in catch filters

## 0.9.9-0 (2013-11-05)

Features:

 - Add `Promise.race()` and `.race()`

## 0.9.8-0 (2013-11-01)

Bugfixes:

 - Fix bug with `Promise.try` not unwrapping returned promises and thenables

## 0.9.7-0 (2013-10-29)

Bugfixes:

 - Fix bug with build files containing duplicated code for promise.js

## 0.9.6-0 (2013-10-28)

Features:

 - Improve output of reporting unhandled non-errors
 - Implement RejectionError wrapping and `.error()` method

## 0.9.5-0 (2013-10-27)

Features:

 - Allow fresh copies of the library to be made

## 0.9.4-1 (2013-10-27)

## 0.9.4-0 (2013-10-27)

Bugfixes:

 - Rollback non-working multiple fresh copies feature

## 0.9.3-0 (2013-10-27)

Features:

 - Allow fresh copies of the library to be made
 - Add more components to customized builds

## 0.9.2-1 (2013-10-25)

## 0.9.2-0 (2013-10-25)

Features:

 - Allow custom builds

## 0.9.1-1 (2013-10-22)

Bugfixes:

 - Fix unhandled rethrown exceptions not reported

## 0.9.1-0 (2013-10-22)

Features:

 - Improve performance of `Promise.try`
 - Extend `Promise.try` to accept arguments and ctx to make it more usable in promisification of synchronous functions.

## 0.9.0-0 (2013-10-18)

Features:

 - Implement `.bind` and `Promise.bind`

Bugfixes:

 - Fix `.some()` when argument is a pending promise that later resolves to an array

## 0.8.5-1 (2013-10-17)

Features:

 - Enable process wide long stack traces through BLUEBIRD_DEBUG environment variable

## 0.8.5-0 (2013-10-16)

Features:

 - Improve performance of all collection methods

Bugfixes:

 - Fix .finally passing the value to handlers
 - Remove kew from benchmarks due to bugs in the library breaking the benchmark
 - Fix some bluebird library calls potentially appearing in stack traces

## 0.8.4-1 (2013-10-15)

Bugfixes:

 - Fix .pending() call showing in long stack traces

## 0.8.4-0 (2013-10-15)

Bugfixes:

 - Fix PromiseArray and its sub-classes swallowing possibly unhandled rejections

## 0.8.3-3 (2013-10-14)

Bugfixes:

 - Fix AMD-declaration using named module.

## 0.8.3-2 (2013-10-14)

Features:

 - The mortals that can handle it may now release Zalgo by `require("bluebird/zalgo");`

## 0.8.3-1 (2013-10-14)

Bugfixes:

 - Fix memory leak when using the same promise to attach handlers over and over again

## 0.8.3-0 (2013-10-13)

Features:

 - Add `Promise.props()` and `Promise.prototype.props()`. They work like `.all()` for object properties.

Bugfixes:

 - Fix bug with .some returning garbage when sparse arrays have rejections

## 0.8.2-2 (2013-10-13)

Features:

 - Improve performance of `.reduce()` when `initialValue` can be synchronously cast to a value

## 0.8.2-1 (2013-10-12)

Bugfixes:

 - Fix .npmignore having irrelevant files

## 0.8.2-0 (2013-10-12)

Features:

 - Improve performance of `.some()`

## 0.8.1-0 (2013-10-11)

Bugfixes:

 - Remove uses of dynamic evaluation (`new Function`, `eval` etc) when strictly not necessary. Use feature detection to use static evaluation to avoid errors when dynamic evaluation is prohibited.

## 0.8.0-3 (2013-10-10)

Features:

 - Add `.asCallback` property to `PromiseResolver`s

## 0.8.0-2 (2013-10-10)

## 0.8.0-1 (2013-10-09)

Features:

 - Improve overall performance. Be able to sustain infinite recursion when using promises.

## 0.8.0-0 (2013-10-09)

Bugfixes:

 - Fix stackoverflow error when function calls itself "synchronously" from a promise handler

## 0.7.12-2 (2013-10-09)

Bugfixes:

 - Fix safari 6 not using `MutationObserver` as a scheduler
 - Fix process exceptions interfering with internal queue flushing

## 0.7.12-1 (2013-10-09)

Bugfixes:

 - Don't try to detect if generators are available to allow shims to be used

## 0.7.12-0 (2013-10-08)

Features:

 - Promisification now consider all functions on the object and its prototype chain
 - Individual promisifcation uses current `this` if no explicit receiver is given
 - Give better stack traces when promisified callbacks throw or errback primitives such as strings by wrapping them in an `Error` object.

Bugfixes:

 - Fix runtime APIs throwing synchronous errors

## 0.7.11-0 (2013-10-08)

Features:

 - Deprecate `Promise.promisify(Object target)` in favor of `Promise.promisifyAll(Object target)` to avoid confusion with function objects
 - Coroutines now throw error when a non-promise is `yielded`

## 0.7.10-1 (2013-10-05)

Features:

 - Make tests pass Internet Explorer 8

## 0.7.10-0 (2013-10-05)

Features:

 - Create browser tests

## 0.7.9-1 (2013-10-03)

Bugfixes:

 - Fix promise cast bug when thenable fulfills using itself as the fulfillment value

## 0.7.9-0 (2013-10-03)

Features:

 - More performance improvements when long stack traces are enabled

## 0.7.8-1 (2013-10-02)

Features:

 - Performance improvements when long stack traces are enabled

## 0.7.8-0 (2013-10-02)

Bugfixes:

 - Fix promisified methods not turning synchronous exceptions into rejections

## 0.7.7-1 (2013-10-02)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.7-0 (2013-10-01)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.6-0 (2013-09-29)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.5-0 (2013-09-28)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.4-1 (2013-09-28)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.4-0 (2013-09-28)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.3-1 (2013-09-28)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.3-0 (2013-09-27)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.2-0 (2013-09-27)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.1-5 (2013-09-26)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.1-4 (2013-09-25)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.1-3 (2013-09-25)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.1-2 (2013-09-24)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.1-1 (2013-09-24)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.1-0 (2013-09-24)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.0-1 (2013-09-23)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.7.0-0 (2013-09-23)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.5-2 (2013-09-20)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.5-1 (2013-09-18)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.5-0 (2013-09-18)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.4-1 (2013-09-18)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.4-0 (2013-09-18)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.3-4 (2013-09-18)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.3-3 (2013-09-18)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.3-2 (2013-09-16)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.3-1 (2013-09-16)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.3-0 (2013-09-15)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.2-1 (2013-09-14)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.2-0 (2013-09-14)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.1-0 (2013-09-14)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.6.0-0 (2013-09-13)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-6 (2013-09-12)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-5 (2013-09-12)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-4 (2013-09-12)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-3 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-2 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-1 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.9-0 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.8-1 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.8-0 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.7-0 (2013-09-11)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.6-1 (2013-09-10)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.6-0 (2013-09-10)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.5-1 (2013-09-10)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.5-0 (2013-09-09)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.4-1 (2013-09-08)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.4-0 (2013-09-08)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.3-0 (2013-09-07)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.2-0 (2013-09-07)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.1-0 (2013-09-07)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.5.0-0 (2013-09-07)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.4.0-0 (2013-09-06)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.3.0-1 (2013-09-06)

Features:

 - feature

Bugfixes:

 - bugfix

## 0.3.0 (2013-09-06)
,,{
  "name": "bluebird",
  "description": "Full featured Promises/A+ implementation with exceptionally good performance",
  "version": "1.0.4",
  "keywords": [
    "promise",
    "performance",
    "promises",
    "promises-a",
    "promises-aplus",
    "async",
    "await",
    "deferred",
    "deferreds",
    "future",
    "flow control",
    "dsl",
    "fluent interface"
  ],
  "scripts": {
    "test": "grunt test"
  },
  "homepage": "https://github.com/petkaantonov/bluebird",
  "repository": {
    "type": "git",
    "url": "git://github.com/petkaantonov/bluebird.git"
  },
  "bugs": {
    "url": "http://github.com/petkaantonov/bluebird/issues"
  },
  "license": "MIT",
  "author": {
    "name": "Petka Antonov",
    "email": "petka_antonov@hotmail.com",
    "url": "http://github.com/petkaantonov/"
  },
  "devDependencies": {
    "grunt": "~0.4.1",
    "grunt-contrib-jshint": "~0.6.4",
    "grunt-contrib-watch": "latest",
    "grunt-contrib-connect": "latest",
    "grunt-saucelabs": "latest",
    "acorn": "~0.3.1",
    "mocha": "~1.12.1",
    "q": "~0.9.7",
    "when": "~2.4.0",
    "deferred": "~0.6.5",
    "rsvp": "~2.0.4",
    "avow": "~2.0.1",
    "jsdom": "~0.8.4",
    "jquery-browserify": "~1.8.1",
    "sinon": "~1.7.3",
    "kew": "~0.2.2",
    "browserify": "~2.35.0",
    "concurrent": "~0.3.2",
    "text-table": "~0.2.0",
    "grunt-cli": "~0.1.9",
    "jshint-stylish": "~0.1.3",
    "semver-utils": "~1.1.0",
    "rimraf": "~2.2.6"
  },
  "readmeFilename": "README.md",
  "main": "./js/main/bluebird.js",
  "readme": "[![Build Status](https://travis-ci.org/petkaantonov/bluebird.png?branch=master)](https://travis-ci.org/petkaantonov/bluebird)\r\n\r\n<a href=\"http://promisesaplus.com/\">\r\n    <img src=\"http://promisesaplus.com/assets/logo-small.png\" alt=\"Promises/A+ logo\"\r\n         title=\"Promises/A+ 1.0 compliant\" align=\"right\" />\r\n</a>\r\n\r\n#Introduction\r\n\r\nBluebird is a fully featured [promise](#what-are-promises-and-why-should-i-use-them) library with focus on innovative features and performance.\r\n\r\n#Topics\r\n\r\n- [Features](#features)\r\n- [Quick start](#quick-start)\r\n- [API Reference and examples](https://github.com/petkaantonov/bluebird/blob/master/API.md)\r\n- [What are promises and why should I use them?](#what-are-promises-and-why-should-i-use-them)\r\n- [Error handling](#error-handling)\r\n- [Development](#development)\r\n    - [Testing](#testing)\r\n    - [Benchmarking](#benchmarks)\r\n    - [Custom builds](#custom-builds)\r\n    - [For library authors](#for-library-authors)\r\n- [What is the sync build?](#what-is-the-sync-build)\r\n- [License](#license)\r\n- [Snippets for common problems](https://github.com/petkaantonov/bluebird/wiki/Snippets)\r\n- [Promise anti-patterns](https://github.com/petkaantonov/bluebird/wiki/Promise-anti-patterns)\r\n- [Changelog](https://github.com/petkaantonov/bluebird/blob/master/changelog.md)\r\n- [Optimization guide](#optimization-guide)\r\n\r\n#Features:\r\n\r\n- [Promises A+ 2.0.2](http://promisesaplus.com)\r\n- [Cancellation](https://github.com/promises-aplus)\r\n- [Progression](https://github.com/promises-aplus/progress-spec)\r\n- [Synchronous inspection](https://github.com/promises-aplus/synchronous-inspection-spec)\r\n- [`.bind`](https://github.com/petkaantonov/bluebird/blob/master/API.md#binddynamic-thisarg---promise)\r\n- [Complete parallel for C# 5.0 async and await](https://github.com/petkaantonov/bluebird/blob/master/API.md#promisecoroutinegeneratorfunction-generatorfunction---function)\r\n- [Collection methods](https://github.com/petkaantonov/bluebird/blob/master/API.md#collections) such as All, any, some, settle, map, filter, reduce, spread, join, race...\r\n- [Practical debugging solutions](#error-handling) such as unhandled rejection reporting, typed catches, catching only what you expect and very long, relevant stack traces without losing perf\r\n- [Sick performance](https://github.com/petkaantonov/bluebird/tree/master/benchmark/stats)\r\n\r\nPasses [AP2](https://github.com/petkaantonov/bluebird/tree/master/test/mocha), [AP3](https://github.com/petkaantonov/bluebird/tree/master/test/mocha), [Cancellation](https://github.com/petkaantonov/bluebird/blob/master/test/mocha/cancel.js), [Progress](https://github.com/petkaantonov/bluebird/blob/master/test/mocha/q_progress.js) tests and more. See [testing](#testing).\r\n\r\n<hr>\r\n\r\n#Quick start\r\n\r\n##Node.js\r\n\r\n    npm install bluebird\r\n\r\nThen:\r\n\r\n```js\r\nvar Promise = require(\"bluebird\");\r\n```\r\n\r\n##Browsers\r\n\r\nDownload the [bluebird.js](https://github.com/petkaantonov/bluebird/tree/master/js/browser) file. And then use a script tag:\r\n\r\n```html\r\n<script type=\"text/javascript\" src=\"/scripts/bluebird.js\"></script>\r\n```\r\n\r\nThe global variable `Promise` becomes available after the above script tag.\r\n\r\n####Browser support\r\n\r\nBrowsers that [implement ECMA-262, edition 3](http://en.wikipedia.org/wiki/Ecmascript#Implementations) and later are supported.\r\n\r\n[![Selenium Test Status](https://saucelabs.com/browser-matrix/petka_antonov.svg)](https://saucelabs.com/u/petka_antonov)\r\n\r\n**Note** that in ECMA-262, edition 3 (IE7, IE8 etc) it is not possible to use methods that have keyword names like `.catch` and `.finally`. The [API documentation](https://github.com/petkaantonov/bluebird/blob/master/API.md) always lists a compatible alternative name that you can use if you need to support these browsers. For example `.catch` is replaced with `.caught` and `.finally` with `.lastly`.\r\n\r\nAlso, [long stack trace](https://github.com/petkaantonov/bluebird/blob/master/API.md#promiselongstacktraces---void) support is only available in Chrome and Firefox.\r\n\r\n<sub>Previously bluebird required es5-shim.js and es5-sham.js to support Edition 3 - these are **no longer required** as of **0.10.4**.</sub>\r\n\r\nAfter quick start, see [API Reference and examples](https://github.com/petkaantonov/bluebird/blob/master/API.md)\r\n\r\n<hr>\r\n\r\n#What are promises and why should I use them?\r\n\r\nYou should use promises to turn this:\r\n\r\n```js\r\nreadFile(\"file.json\", function(err, val) {\r\n    if( err ) {\r\n        console.error(\"unable to read file\");\r\n    }\r\n    else {\r\n        try {\r\n            val = JSON.parse(val);\r\n            console.log(val.success);\r\n        }\r\n        catch( e ) {\r\n            console.error(\"invalid json in file\");\r\n        }\r\n    }\r\n});\r\n```\r\n\r\nInto this:\r\n\r\n```js\r\nreadFile(\"file.json\").then(JSON.parse).then(function(val) {\r\n    console.log(val.success);\r\n})\r\n.catch(SyntaxError, function(e) {\r\n    console.error(\"invalid json in file\");\r\n})\r\n.catch(function(e){\r\n    console.error(\"unable to read file\")\r\n});\r\n```\r\n\r\nActually you might notice the latter has a lot in common with code that would do the same using synchronous I/O:\r\n\r\n```js\r\ntry {\r\n    var val = JSON.parse(readFile(\"file.json\"));\r\n    console.log(val.success);\r\n}\r\n//Syntax actually not supported in JS but drives the point\r\ncatch(SyntaxError e) {\r\n    console.error(\"invalid json in file\");\r\n}\r\ncatch(Error e) {\r\n    console.error(\"unable to read file\")\r\n}\r\n```\r\n\r\nAnd that is the point - being able to have something that is a lot like `return` and `throw` in synchronous code.\r\n\r\nYou can also use promises to improve code that was written with callback helpers:\r\n\r\n\r\n```js\r\n//Copyright Plato http://stackoverflow.com/a/19385911/995876\r\n//CC BY-SA 2.5\r\nmapSeries(URLs, function (URL, done) {\r\n    var options = {};\r\n    needle.get(URL, options, function (error, response, body) {\r\n        if (error) {\r\n            return done(error)\r\n        }\r\n        try {\r\n            var ret = JSON.parse(body);\r\n            return done(null, ret);\r\n        }\r\n        catch (e) {\r\n            done(e);\r\n        }\r\n    });\r\n}, function (err, results) {\r\n    if (err) {\r\n        console.log(err)\r\n    } else {\r\n        console.log('All Needle requests successful');\r\n        // results is a 1 to 1 mapping in order of URLs > needle.body\r\n        processAndSaveAllInDB(results, function (err) {\r\n            if (err) {\r\n                return done(err)\r\n            }\r\n            console.log('All Needle requests saved');\r\n            done(null);\r\n        });\r\n    }\r\n});\r\n```\r\n\r\nIs more pleasing to the eye when done with promises:\r\n\r\n```js\r\nPromise.promisifyAll(needle);\r\nvar options = {};\r\n\r\nvar current = Promise.resolve();\r\nPromise.map(URLs, function(URL) {\r\n    current = current.then(function () {\r\n        return needle.getAsync(URL, options);\r\n    });\r\n    return current;\r\n}).map(function(responseAndBody){\r\n    return JSON.parse(responseAndBody[1]);\r\n}).then(function (results) {\r\n    return processAndSaveAllInDB(results);\r\n}).then(function(){\r\n    console.log('All Needle requests saved');\r\n}).catch(function (e) {\r\n    console.log(e);\r\n});\r\n```\r\n\r\nAlso promises don't just give you correspondences for synchronous features but can also be used as limited event emitters or callback aggregators.\r\n\r\nMore reading:\r\n\r\n - [Promise nuggets](http://spion.github.io/promise-nuggets/)\r\n - [Why I am switching to promises](http://spion.github.io/posts/why-i-am-switching-to-promises.html)\r\n - [What is the the point of promises](http://domenic.me/2012/10/14/youre-missing-the-point-of-promises/#toc_1)\r\n - [Snippets for common problems](https://github.com/petkaantonov/bluebird/wiki/Snippets)\r\n - [Promise anti-patterns](https://github.com/petkaantonov/bluebird/wiki/Promise-anti-patterns)\r\n\r\n#Error handling\r\n\r\nThis is a problem every promise library needs to handle in some way. Unhandled rejections/exceptions don't really have a good agreed-on asynchronous correspondence. The problem is that it is impossible to predict the future and know if a rejected promise will eventually be handled.\r\n\r\nThere are two common pragmatic attempts at solving the problem that promise libraries do.\r\n\r\nThe more popular one is to have the user explicitly communicate that they are done and any unhandled rejections should be thrown, like so:\r\n\r\n```js\r\ndownload().then(...).then(...).done();\r\n```\r\n\r\nFor handling this problem, in my opinion, this is completely unacceptable and pointless. The user must remember to explicitly call `.done` and that cannot be justified when the problem is forgetting to create an error handler in the first place.\r\n\r\nThe second approach, which is what bluebird by default takes, is to call a registered handler if a rejection is unhandled by the start of a second turn. The default handler is to write the stack trace to stderr or `console.error` in browsers. This is close to what happens with synchronous code - your code doens't work as expected and you open console and see a stack trace. Nice.\r\n\r\nOf course this is not perfect, if your code for some reason needs to swoop in and attach error handler to some promise after the promise has been hanging around a while then you will see annoying messages. In that case you can use the `.done()` method to signal that any hanging exceptions should be thrown.\r\n\r\nIf you want to override the default handler for these possibly unhandled rejections, you can pass yours like so:\r\n\r\n```js\r\nPromise.onPossiblyUnhandledRejection(function(error){\r\n    throw error;\r\n});\r\n```\r\n\r\nIf you want to also enable long stack traces, call:\r\n\r\n```js\r\nPromise.longStackTraces();\r\n```\r\n\r\nright after the library is loaded.\r\n\r\nIn node.js use the environment flag `BLUEBIRD_DEBUG`:\r\n\r\n```\r\nBLUEBIRD_DEBUG=1 node server.js\r\n```\r\n\r\nto enable long stack traces in all instances of bluebird.\r\n\r\nLong stack traces cannot be disabled after being enabled, and cannot be enabled after promises have alread been created. Long stack traces imply a substantial performance penalty, even after using every trick to optimize them.\r\n\r\nLong stack traces are enabled by default in the debug build.\r\n\r\n####Expected and unexpected errors\r\n\r\nA practical problem with Promises/A+ is that it models Javascript `try-catch` too closely for its own good. Therefore by default promises inherit `try-catch` warts such as the inability to specify the error types that the catch block is eligible for. It is an anti-pattern in every other language to use catch-all handlers because they swallow exceptions that you might not know about.\r\n\r\nNow, Javascript does have a perfectly fine and working way of creating error type hierarchies. It is still quite awkward to use them with the built-in `try-catch` however:\r\n\r\n```js\r\ntry {\r\n    //code\r\n}\r\ncatch(e) {\r\n    if( e instanceof WhatIWantError) {\r\n        //handle\r\n    }\r\n    else {\r\n        throw e;\r\n    }\r\n}\r\n```\r\n\r\nWithout such checking, unexpected errors would be silently swallowed. However, with promises, bluebird brings the future (hopefully) here now and extends the `.catch` to [accept potential error type eligibility](https://github.com/petkaantonov/bluebird/blob/master/API.md#catchfunction-errorclass-function-handler---promise).\r\n\r\nFor instance here it is expected that some evil or incompetent entity will try to crash our server from `SyntaxError` by providing syntactically invalid JSON:\r\n\r\n```js\r\ngetJSONFromSomewhere().then(function(jsonString) {\r\n    return JSON.parse(jsonString);\r\n}).then(function(object) {\r\n    console.log(\"it was valid json: \", object);\r\n}).catch(SyntaxError, function(e){\r\n    console.log(\"don't be evil\");\r\n});\r\n```\r\n\r\nHere any kind of unexpected error will automatically reported on stderr along with a stack trace because we only register a handler for the expected `SyntaxError`.\r\n\r\nOk, so, that's pretty neat. But actually not many libraries define error types and it is in fact a complete ghetto out there with ad hoc strings being attached as some arbitrary property name like `.name`, `.type`, `.code`, not having any property at all or even throwing strings as errors and so on. So how can we still listen for expected errors?\r\n\r\nBluebird defines a special error type `RejectionError` (you can get a reference from `Promise.RejectionError`). This type of error is given as rejection reason by promisified methods when\r\ntheir underlying library gives an untyped, but expected error. Primitives such as strings, and error objects that are directly created like `new Error(\"database didn't respond\")` are considered untyped.\r\n\r\nExample of such library is the node core library `fs`. So if we promisify it, we can catch just the errors we want pretty easily and have programmer errors be redirected to unhandled rejection handler so that we notice them:\r\n\r\n```js\r\n//Read more about promisification in the API Reference:\r\n//https://github.com/petkaantonov/bluebird/blob/master/API.md\r\nvar fs = Promise.promisifyAll(require(\"fs\"));\r\n\r\nfs.readFileAsync(\"myfile.json\").then(JSON.parse).then(function (json) {\r\n    console.log(\"Successful json\")\r\n}).catch(SyntaxError, function (e) {\r\n    console.error(\"file contains invalid json\");\r\n}).catch(Promise.RejectionError, function (e) {\r\n    console.error(\"unable to read file, because: \", e.message);\r\n});\r\n```\r\n\r\nThe last `catch` handler is only invoked when the `fs` module explicitly used the `err` argument convention of async callbacks to inform of an expected error. The `RejectionError` instance will contain the original error in its `.cause` property but it does have a direct copy of the `.message` and `.stack` too. In this code any unexpected error - be it in our code or the `fs` module - would not be caught by these handlers and therefore not swallowed.\r\n\r\nSince a `catch` handler typed to `Promise.RejectionError` is expected to be used very often, it has a neat shorthand:\r\n\r\n```js\r\n.error(function (e) {\r\n    console.error(\"unable to read file, because: \", e.message);\r\n});\r\n```\r\n\r\nSee [API documentation for `.error()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#error-rejectedhandler----promise)\r\n\r\nFinally, Bluebird also supports predicate-based filters. If you pass a\r\npredicate function instead of an error type, the predicate will receive\r\nthe error as an argument. The return result will be used determine whether\r\nthe error handler should be called.\r\n\r\nPredicates should allow for very fine grained control over caught errors:\r\npattern matching, error typesets with set operations and many other techniques\r\ncan be implemented on top of them.\r\n\r\nExample of using a predicate-based filter:\r\n\r\n```js\r\nvar Promise = require(\"bluebird\");\r\nvar request = Promise.promisify(require(\"request\"));\r\n\r\nfunction clientError(e) {\r\n    return e.code >= 400 && e.code < 500;\r\n}\r\n\r\nrequest(\"http://www.google.com\").then(function(contents){\r\n    console.log(contents);\r\n}).catch(clientError, function(e){\r\n   //A client error like 400 Bad Request happened\r\n});\r\n```\r\n\r\n**Danger:** The JavaScript language allows throwing primitive values like strings. Throwing primitives can lead to worse or no stack traces. Primitives [are not exceptions](http://www.devthought.com/2011/12/22/a-string-is-not-an-error/). You should consider always throwing Error objects when handling exceptions.\r\n\r\n<hr>\r\n\r\n####How do long stack traces differ from e.g. Q?\r\n\r\nBluebird attempts to have more elaborate traces. Consider:\r\n\r\n```js\r\nError.stackTraceLimit = 25;\r\nQ.longStackSupport = true;\r\nQ().then(function outer() {\r\n    return Q().then(function inner() {\r\n        return Q().then(function evenMoreInner() {\r\n            a.b.c.d();\r\n        }).catch(function catcher(e){\r\n            console.error(e.stack);\r\n        });\r\n    })\r\n});\r\n```\r\n\r\nYou will see\r\n\r\n    ReferenceError: a is not defined\r\n        at evenMoreInner (<anonymous>:7:13)\r\n    From previous event:\r\n        at inner (<anonymous>:6:20)\r\n\r\nCompare to:\r\n\r\n```js\r\nError.stackTraceLimit = 25;\r\nPromise.longStackTraces();\r\nPromise.resolve().then(function outer() {\r\n    return Promise.resolve().then(function inner() {\r\n        return Promise.resolve().then(function evenMoreInner() {\r\n            a.b.c.d()\r\n        }).catch(function catcher(e){\r\n            console.error(e.stack);\r\n        });\r\n    });\r\n});\r\n```\r\n\r\n    ReferenceError: a is not defined\r\n        at evenMoreInner (<anonymous>:7:13)\r\n    From previous event:\r\n        at inner (<anonymous>:6:36)\r\n    From previous event:\r\n        at outer (<anonymous>:5:32)\r\n    From previous event:\r\n        at <anonymous>:4:21\r\n        at Object.InjectedScript._evaluateOn (<anonymous>:572:39)\r\n        at Object.InjectedScript._evaluateAndWrap (<anonymous>:531:52)\r\n        at Object.InjectedScript.evaluate (<anonymous>:450:21)\r\n\r\n\r\nA better and more practical example of the differences can be seen in gorgikosev's [debuggability competition](https://github.com/spion/async-compare#debuggability).\r\n\r\n<hr>\r\n\r\n####Can I use long stack traces in production?\r\n\r\nProbably yes. Bluebird uses multiple innovative techniques to optimize long stack traces. Even with long stack traces, it is still way faster than similarly featured implementations that don't have long stack traces enabled and about same speed as minimal implementations. A slowdown of 4-5x is expected, not 50x.\r\n\r\nWhat techniques are used?\r\n\r\n#####V8 API second argument\r\n\r\nThis technique utilizes the [slightly under-documented](https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi#Stack_trace_collection_for_custom_exceptions) second argument of V8 `Error.captureStackTrace`. It turns out that the second argument can actually be used to make V8 skip all library internal stack frames [for free](https://github.com/v8/v8/blob/b5fabb9225e1eb1c20fd527b037e3f877296e52a/src/isolate.cc#L665). It only requires propagation of callers manually in library internals but this is not visible to you as user at all.\r\n\r\nWithout this technique, every promise (well not every, see second technique) created would have to waste time creating and collecting library internal frames which will just be thrown away anyway. It also allows one to use smaller stack trace limits because skipped frames are not counted towards the limit whereas with collecting everything upfront and filtering afterwards would likely have to use higher limits to get more user stack frames in.\r\n\r\n#####Sharing stack traces\r\n\r\nConsider:\r\n\r\n```js\r\nfunction getSomethingAsync(fileName) {\r\n    return readFileAsync(fileName).then(function(){\r\n        //...\r\n    }).then(function() {\r\n        //...\r\n    }).then(function() {\r\n        //...\r\n    });\r\n}\r\n```\r\n\r\nEverytime you call this function it creates 4 promises and in a straight-forward long stack traces implementation it would collect 4 almost identical stack traces. Bluebird has a light weight internal data-structure (kcnown as context stack in the source code) to help tracking when traces can be re-used and this example would only collect one trace.\r\n\r\n#####Lazy formatting\r\n\r\nAfter a stack trace has been collected on an object, one must be careful not to reference the `.stack` property until necessary. Referencing the property causes\r\nan expensive format call and the stack property is turned into a string which uses much more memory.\r\n\r\nWhat about [Q #111](https://github.com/kriskowal/q/issues/111)?\r\n\r\nLong stack traces is not inherently the problem. For example with latest Q with stack traces disabled:\r\n\r\n```js\r\nvar Q = require(\"q\");\r\n\r\n\r\nfunction test(i){\r\n    if (i <= 0){\r\n       return Q.when('done')\r\n   } else {\r\n       return Q.when(i-1).then(test)\r\n   }\r\n}\r\ntest(1000000000).then(function(output){console.log(output) });\r\n```\r\n\r\nAfter 2 minutes of running this, it will give:\r\n\r\n```js\r\nFATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - process out of memory\r\n```\r\n\r\nSo the problem with this is how much absolute memory is used per promise - not whether long traces are enabled or not.\r\n\r\nFor some purpose, let's say 100000 parallel pending promises in memory at the same time is the maximum. You would then roughly use 100MB for them instead of 10MB with stack traces disabled.For comparison, just creating 100000 functions alone will use 14MB if they're closures. All numbers can be halved for 32-bit node.\r\n\r\n<hr>\r\n\r\n#Development\r\n\r\nFor development tasks such as running benchmarks or testing, you need to clone the repository and install dev-dependencies.\r\n\r\nInstall [node](http://nodejs.org/), [npm](https://npmjs.org/), and [grunt](http://gruntjs.com/).\r\n\r\n    git clone git@github.com:petkaantonov/bluebird.git\r\n    cd bluebird\r\n    npm install\r\n\r\n##Testing\r\n\r\nTo run all tests, run `grunt test`. Note that 10 processes are created to run the tests in parallel. The stdout of tests is ignored by default and everything will stop at the first failure.\r\n\r\nIndividual files can be run with `grunt test --run=filename` where `filename` is a test file name in `/test` folder or `/test/mocha` folder. The `.js` prefix is not needed. The dots for AP compliance tests are not needed, so to run `/test/mocha/2.3.3.js` for instance:\r\n\r\n    grunt test --run=233\r\n\r\nWhen trying to get a test to pass, run only that individual test file with `--verbose` to see the output from that test:\r\n\r\n    grunt test --run=233 --verbose\r\n\r\nThe reason for the unusual way of testing is because the majority of tests are from different libraries using different testing frameworks and because it takes forever to test sequentially.\r\n\r\n\r\n###Testing in browsers\r\n\r\nTo test in browsers:\r\n\r\n    cd browser\r\n    setup\r\n\r\nThen open the `index.html` in your browser. Requires bash (on windows the mingw32 that comes with git works fine too).\r\n\r\nYou may also [visit the github hosted page](http://petkaantonov.github.io/bluebird/browser/).\r\n\r\nKeep the test tab active because some tests are timing-sensitive and will fail if the browser is throttling timeouts. Chrome will do this for example when the tab is not active.\r\n\r\n##Benchmarks\r\n\r\nTo run a benchmark, run the given command for a benchmark while on the project root. Requires bash (on windows the mingw32 that comes with git works fine too).\r\n\r\nNode 0.11.2+ is required to run the generator examples.\r\n\r\n###1\\. DoxBee sequential\r\n\r\nCurrently the most relevant benchmark is @gorkikosev's benchmark in the article [Analysis of generators and other async patterns in node](http://spion.github.io/posts/analysis-generators-and-other-async-patterns-node.html). The benchmark emulates a situation where n amount of users are making a request in parallel to execute some mixed async/sync action. The benchmark has been modified to include a warm-up phase to minimize any JITing during timed sections.\r\n\r\nCommand: `bench doxbee`\r\n\r\n###2\\. Made-up parallel\r\n\r\nThis made-up scenario runs 15 shimmed queries in parallel.\r\n\r\nCommand: `bench parallel`\r\n\r\n##Custom builds\r\n\r\nCustom builds for browsers are supported through a command-line utility.\r\n\r\n\r\n\r\n\r\n<table>\r\n    <caption>The following features can be disabled</caption>\r\n    <thead>\r\n        <tr>\r\n            <th>Feature(s)</th>\r\n            <th>Command line identifier</th>\r\n        </tr>\r\n    </thead>\r\n    <tbody>\r\n\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#any---promise\"><code>.any</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promiseanyarraydynamicpromise-values---promise\"><code>Promise.any</code></a></td><td><code>any</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#race---promise\"><code>.race</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promiseracearraypromise-promises---promise\"><code>Promise.race</code></a></td><td><code>race</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#callstring-propertyname--dynamic-arg---promise\"><code>.call</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#getstring-propertyname---promise\"><code>.get</code></a></td><td><code>call_get</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#filterfunction-filterer---promise\"><code>.filter</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisefilterarraydynamicpromise-values-function-filterer---promise\"><code>Promise.filter</code></a></td><td><code>filter</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#mapfunction-mapper---promise\"><code>.map</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisemaparraydynamicpromise-values-function-mapper---promise\"><code>Promise.map</code></a></td><td><code>map</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#reducefunction-reducer--dynamic-initialvalue---promise\"><code>.reduce</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisereducearraydynamicpromise-values-function-reducer--dynamic-initialvalue---promise\"><code>Promise.reduce</code></a></td><td><code>reduce</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#props---promise\"><code>.props</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisepropsobjectpromise-object---promise\"><code>Promise.props</code></a></td><td><code>props</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#settle---promise\"><code>.settle</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisesettlearraydynamicpromise-values---promise\"><code>Promise.settle</code></a></td><td><code>settle</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#someint-count---promise\"><code>.some</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisesomearraydynamicpromise-values-int-count---promise\"><code>Promise.some</code></a></td><td><code>some</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#nodeifyfunction-callback---promise\"><code>.nodeify</code></a></td><td><code>nodeify</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisecoroutinegeneratorfunction-generatorfunction---function\"><code>Promise.coroutine</code></a> and <a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisespawngeneratorfunction-generatorfunction---promise\"><code>Promise.spawn</code></a></td><td><code>generators</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#progression\">Progression</a></td><td><code>progress</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#promisification\">Promisification</a></td><td><code>promisify</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#cancellation\">Cancellation</a></td><td><code>cancel</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#synchronous-inspection\">Synchronous inspection</a></td><td><code>synchronous_inspection</code></td></tr>\r\n        <tr><td><a href=\"https://github.com/petkaantonov/bluebird/blob/master/API.md#timers\">Timers</a></td><td><code>timers</code></td></tr>\r\n\r\n    </tbody>\r\n</table>\r\n\r\n\r\nMake sure you have cloned the repo somewhere and did `npm install` successfully.\r\n\r\nAfter that you can run:\r\n\r\n    grunt build --features=\"core\"\r\n\r\n\r\nThe above builds the most minimal build you can get. You can add more features separated by spaces from the above list:\r\n\r\n    grunt build --features=\"core filter map reduce\"\r\n\r\nThe custom build file will be found from `/js/browser/bluebird.js`. It will have a comment that lists the disabled and enabled features.\r\n\r\nNote that the build leaves the `/js/main` etc folders with same features so if you use the folder for node.js at the same time, don't forget to build\r\na full version afterwards (after having taken a copy of the bluebird.js somewhere):\r\n\r\n    grunt build\r\n\r\n<hr>\r\n\r\n##For library authors\r\n\r\nBuilding a library that depends on bluebird? You should know about a few features.\r\n\r\nIf your library needs to do something obtrusive like adding or modifying methods on the `Promise` prototype, uses long stack traces or uses a custom unhandled rejection handler then... that's totally ok as long as you don't use `require(\"bluebird\")`. Instead you should create a file\r\nthat creates an isolated copy. For example, creating a file called `bluebird-extended.js` that contains:\r\n\r\n```js\r\n                //NOTE the function call right after\r\nmodule.exports = require(\"bluebird/js/main/promise\")();\r\n```\r\n\r\nYour library can then use `var Promise = require(\"bluebird-extended\");` and do whatever it wants with it. Then if the application or other library uses their own bluebird promises they will all play well together because of Promises/A+ thenable assimilation magic.\r\n\r\nYou should also know about [`.nodeify()`](https://github.com/petkaantonov/bluebird/blob/master/API.md#nodeifyfunction-callback---promise) which makes it easy to provide a dual callback/promise API.\r\n\r\n<hr>\r\n\r\n##What is the sync build?\r\n\r\nYou may now use sync build by:\r\n\r\n    var Promise = require(\"bluebird/zalgo\");\r\n\r\nThe sync build is provided to see how forced asynchronity affects benchmarks. It should not be used in real code due to the implied hazards.\r\n\r\nThe normal async build gives Promises/A+ guarantees about asynchronous resolution of promises. Some people think this affects performance or just plain love their code having a possibility\r\nof stack overflow errors and non-deterministic behavior.\r\n\r\nThe sync build skips the async call trampoline completely, e.g code like:\r\n\r\n    async.invoke( this.fn, this, val );\r\n\r\nAppears as this in the sync build:\r\n\r\n    this.fn(val);\r\n\r\nThis should pressure the CPU slightly less and thus the sync build should perform better. Indeed it does, but only marginally. The biggest performance boosts are from writing efficient Javascript, not from compromising determinism.\r\n\r\nNote that while some benchmarks are waiting for the next event tick, the CPU is actually not in use during that time. So the resulting benchmark result is not completely accurate because on node.js you only care about how much the CPU is taxed. Any time spent on CPU is time the whole process (or server) is paralyzed. And it is not graceful like it would be with threads.\r\n\r\n\r\n```js\r\nvar cache = new Map(); //ES6 Map or DataStructures/Map or whatever...\r\nfunction getResult(url) {\r\n    var resolver = Promise.pending();\r\n    if (cache.has(url)) {\r\n        resolver.resolve(cache.get(url));\r\n    }\r\n    else {\r\n        http.get(url, function(err, content) {\r\n            if (err) resolver.reject(err);\r\n            else {\r\n                cache.set(url, content);\r\n                resolver.resolve(content);\r\n            }\r\n        });\r\n    }\r\n    return resolver.promise;\r\n}\r\n\r\n\r\n\r\n//The result of console.log is truly random without async guarantees\r\nfunction guessWhatItPrints( url ) {\r\n    var i = 3;\r\n    getResult(url).then(function(){\r\n        i = 4;\r\n    });\r\n    console.log(i);\r\n}\r\n```\r\n\r\n#Optimization guide\r\n\r\nArticles about optimization will be periodically posted in [the wiki section](https://github.com/petkaantonov/bluebird/wiki), polishing edits are welcome.\r\n\r\nA single cohesive guide compiled from the articles will probably be done eventually.\r\n\r\n#License\r\n\r\nCopyright (c) 2014 Petka Antonov\r\n\r\nPermission is hereby granted, free of charge, to any person obtaining a copy\r\nof this software and associated documentation files (the \"Software\"), to deal\r\nin the Software without restriction, including without limitation the rights\r\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\r\ncopies of the Software, and to permit persons to whom the Software is\r\nfurnished to do so, subject to the following conditions:</p>\r\n\r\nThe above copyright notice and this permission notice shall be included in\r\nall copies or substantial portions of the Software.\r\n\r\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\r\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\r\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE\r\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\r\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\r\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\r\nTHE SOFTWARE.\r\n",
  "_id": "bluebird@1.0.4",
  "_from": "bluebird@~1.0.4"
}
,module.exports = require('./js/zalgo/bluebird.js');
var fs = require('fs');

var dir = '/Users/mehul/code/learnPromises/node_modules/bluebird/';

var dataStore = [];

fs.readdir(dir, function(err, files) {
  console.log(files);
  files.forEach(function(file) {
    fs.readFile(dir+file, 'utf-8', function(err, data) {
      dataStore.push(data);
      fs.writeFile('foo.js', dataStore, function (err) {
        console.log("It's saved!");
      });
    });
  });
});{
  "name": "learnPromises",
  "version": "0.0.0",
  "description": "",
  "main": "index.js",
  "dependencies": {
    "bluebird": "~1.0.4",
    "underscore": "~1.6.0"
  },
  "devDependencies": {},
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "",
  "license": "ISC"
}
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var _ = require('underscore');

// .then converts whatever is returned from the function passed into it into a promise object
var directory = '/Users/mehul/code/learnPromises/';

fs.readdirAsync('/Users/mehul/code/learnPromises/')
.then(function(dirs) {
  return Promise.all(_.map(dirs, function(dir) {
    return fs.statAsync(path.join(directory,dir)).then(function(obj){
      obj['directory'] = dir;
      return obj;
    });
  }));
})
.then(function(stats) {
  return _.chain(stats)
  .filter(function(stat){
    return stat.isFile();
  })
  .map(function(obj){
    return obj.directory;
  }).value();
})
.then(function(dirs) {
  return Promise.all(_.map(dirs, function(dir) {
    console.log(dir);
    return fs.readFileAsync(path.join(directory,dir), 'utf8');
  }));
}).then(function(arrayOfContents) {
  var contents = _.reduce(arrayOfContents, function(memo, value) {
    return memo+value;
  }, '');
  console.log(contents);
  return fs.writeFileAsync('bar.js', contents);
}).then(function(){
  console.log('this shit works');
});
