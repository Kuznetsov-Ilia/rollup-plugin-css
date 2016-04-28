'use strict';

function _interopDefault(ex) {
  return ex && typeof ex === 'object' && 'default' in ex ? ex['default'] : ex;
}

var fs = require('fs');
var fs__default = _interopDefault(fs);
var rollupPluginutils = require('rollup-pluginutils');
var postcss = _interopDefault(require('postcss'));
var CssModules = _interopDefault(require('css-modules-loader-core'));
var path = require('path');
var glob = _interopDefault(require('glob'));
var myUtil = require('my-util');

function pathJoin(file) {
  return path.join(process.cwd(), file);
}
var cssfile = [];
var cached = {};
var trace = 0;
CssModules.scope.generateScopedName = function (name, filename, css) {
  var pathName = filename.split('/').slice(2, -1).concat([name]).join('-');
  var hash = myUtil.toRadix(myUtil.stringHash(pathName), 64);
  if (hash[0] == Number(hash[0])) {
    hash = '_' + hash;
  }
  return hash;
};

var cssModules = new CssModules();
function src() {
  var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  var filter = rollupPluginutils.createFilter(options.include, options.exclude);
  return {
    transform: function transform(source, id) {
      if (!filter(id)) {
        return null;
      }
      var opts = {
        from: options.from ? pathJoin(options.from) : id,
        to: options.to ? pathJoin(options.to) : id,
        map: {
          inline: false,
          annotation: false
        }
      };
      var relativePath = path.relative(process.cwd(), id);
      trace++;
      var cache = function cache(res) {
        cached[relativePath] = res;
        cssfile.push(res.injectableSource);
        return res;
      };
      return postcss(options.plugins || []).process(source, opts).then(function (_ref) {
        var css = _ref.css;
        var map = _ref.map;
        return cssModules.load(css, relativePath, trace, pathFetcher).then(cache).then(function (_ref2) {
          var exportTokens = _ref2.exportTokens;
          return {
            code: getExports(exportTokens),
            map: options.sourceMap && map ? JSON.parse(map) : { mappings: '' }
          };
        });
      });
    },
    transformBundle: function transformBundle() {
      var output = cssfile.join('');
      if (typeof options.post === 'function') {
        output = options.post(output);
      }
      fs__default.writeFile(options.output, output);
    }
  };
}

function getExports(exportTokens) {
  return Object.keys(exportTokens).map(function (t) {
    return 'var ' + t + '="' + exportTokens[t] + '"';
  }).concat(['export { ' + Object.keys(exportTokens).join(',') + ' }', 'export default ' + JSON.stringify(exportTokens)]).join(';\n');
}

function pathFetcher(file, relativeTo, depTrace) {
  var sourcePath;
  file = file.replace(/^["']|["']$/g, '');
  if (file.startsWith('.')) {
    return Promise.reject('implement relative path bleat!');
    var dir = path.dirname(relativeTo);
    var _sourcePath = glob.sync(path.join(dir, file))[0];
    if (!_sourcePath) {
      console.error('no sourcePath', dir, file);
    }
  } else {
    sourcePath = 'node_modules/' + file;
    if (!file.endsWith('.css')) {
      sourcePath += '.css';
    }
  }
  return new Promise(function (resolve, reject) {
    var _cached = cached[sourcePath];
    if (_cached) {
      return resolve(_cached.exportTokens);
    }
    fs.readFile(sourcePath, 'utf-8', function (error, sourceString) {
      if (error) {
        return reject(error);
      }
      cssModules.load(sourceString, sourcePath, ++trace, pathFetcher).then(function (result) {
        cached[sourcePath] = result;
        resolve(result.exportTokens);
      }).catch(reject);
    });
  });
}

module.exports = src;

