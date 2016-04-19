'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = require('fs');
var fs__default = _interopDefault(fs);
var rollupPluginutils = require('rollup-pluginutils');
var postcss = _interopDefault(require('postcss'));
var CssModules = _interopDefault(require('css-modules-loader-core'));
var path = require('path');
var glob = _interopDefault(require('glob'));

function pathJoin(file) {
  return path.join(process.cwd(), file);
}
var cssfile = [];
const cached = {};
var trace = 0;
const cssModules = new CssModules();
function src (options = {}) {
  const filter = rollupPluginutils.createFilter(options.include, options.exclude);
  /*const outputFile = typeof options.output === 'string';
  const outputFunction = typeof options.output === 'function';*/
  return {
    transform(source, id) {
      if (!filter(id)) {
        return null;
      }
      const opts = {
        from: options.from ? pathJoin(options.from) : id,
        to: options.to ? pathJoin(options.to) : id,
        map: {
          inline: false,
          annotation: false
        }
      };
      const relativePath = path.relative(process.cwd(), id);
      //console.log('relativePath', relativePath);
      trace++;
      var cache = (res) => {
        cached[relativePath] = res;
        cssfile.push(res.injectableSource);
        return res;
      };
      return postcss(options.plugins || [])
        .process(source, opts)
        .then(({ css, map }) => cssModules
          .load(css, relativePath, trace, pathFetcher)
          .then(cache)
          .then(({ exportTokens }) => ({
              code: getExports(exportTokens),
              map: options.sourceMap && map ? JSON.parse(map) : {mappings: ''}
            }))
          //.then(res => {console.log(res);return res;})
        )
        /*.then(r => {
                  if (outputFile) {
                    fs.writeFile(options.output, cssfile.join(''));
                  } else if (outputFunction) {
                    options.output(cssfile.join('\n'));
                  }
                  return r;
                })*/
      ;
    },
    transformBundle() {
      console.log('writing css to:', options.output);
      fs__default.writeFile(options.output, cssfile.join(''));
    }
  };
}



function getExports(exportTokens) {
  return Object.keys(exportTokens)
    .map(t => `var ${t}="${exportTokens[t]}"`)
    .concat([
      `export { ${Object.keys(exportTokens).join(',')} }`,
      `export default ${JSON.stringify(exportTokens)}`
    ])
    .join(';\n');
}

function pathFetcher(file, relativeTo, depTrace) {
  var sourcePath;
  file = file.replace(/^["']|["']$/g, '');
  if (file.startsWith('.')) {
    return Promise.reject('implement relative path bleat!');
    let dir = path.dirname(relativeTo);
    let sourcePath = glob.sync(path.join(dir, file))[0];
    console.log('sourcePath', sourcePath);
    if (!sourcePath) {
      console.error('no sourcePath', dir, file);
      /*this._options.paths.some(dir => {
        return sourcePath = glob.sync(join(dir, file))[0]
      })*/
    }
    /*if (!sourcePath) {
      return new Promise((resolve, reject) => {
        let errorMsg = `Not Found : ${file}  from ${dir}`;
        if (this._options.paths.length) {
          errorMsg += " and " + this._options.paths.join(" ")
        }
        reject(errorMsg)
      })
    }*/
  } else {
    sourcePath = `node_modules/${file}`;
    if (!file.endsWith('.css')) {
      sourcePath += '.css';
    }
    console.log('pathFetcher', sourcePath);
  }
  return new Promise((resolve, reject) => {
    let _cached = cached[sourcePath];
    if (_cached) {
      return resolve(_cached.exportTokens);
    }
    fs.readFile(sourcePath, 'utf-8', (error, sourceString) => {
      if (error) {
        return reject(error);
      }
      cssModules
        .load(sourceString, sourcePath, ++trace, pathFetcher)
        .then(result => {
          cached[sourcePath] = result;
          resolve(result.exportTokens);
        })
        .catch(reject);
    });
  });
}

module.exports = src;