import fs from 'fs';
import { createFilter } from 'rollup-pluginutils';
import postcss from 'postcss';
import CssModules from 'css-modules-loader-core';
import { join, dirname, relative } from 'path';
import { /*writeFile,*/ readFile } from 'fs';
import glob from 'glob';
import {toRadix, stringHash} from 'my-util';

function pathJoin(file) {
  return join(process.cwd(), file);
}
var cssfile = [];
const cached = {};
var trace = 0;
CssModules.scope.generateScopedName = function (name, filename, css) {
  var pathName = filename.split('/').slice(2, -1).concat([name]).join('-');
  var hash = toRadix(stringHash(pathName), 64);
  if (hash[0] == Number(hash[0])) {
    hash = '_' + hash;
  }
  return hash;
};

const cssModules = new CssModules();
export default function (options = {}) {
  const filter = createFilter(options.include, options.exclude);
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
      const relativePath = relative(process.cwd(), id);
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
        )
    },
    transformBundle() {
      var output = cssfile.join('');
      if (typeof options.post === 'function') {
        output = options.post(output);
      }
      fs.writeFile(options.output, output);
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
    let dir = dirname(relativeTo);
    let sourcePath = glob.sync(join(dir, file))[0];
    if (!sourcePath) {
      console.error('no sourcePath', dir, file);
    }
  } else {
    sourcePath = `node_modules/${file}`;
    if (!file.endsWith('.css')) {
      sourcePath += '.css';
    }
  }
  return new Promise((resolve, reject) => {
    let _cached = cached[sourcePath];
    if (_cached) {
      return resolve(_cached.exportTokens);
    }
    readFile(sourcePath, 'utf-8', (error, sourceString) => {
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
