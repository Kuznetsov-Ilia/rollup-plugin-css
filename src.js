import fs from 'fs';
import { createFilter } from 'rollup-pluginutils';
import postcss from 'postcss';
import CssModules from 'css-modules-loader-core';
import { join, dirname, relative } from 'path';
import { /*writeFile,*/ readFile } from 'fs';
import glob from 'glob';
function pathJoin(file) {
  return join(process.cwd(), file);
}
var cssfile = [];
const cached = {};
var trace = 0;
function stringHash(str) {
  var hash = 5381;
  var i = str.length;

  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }

  /* JavaScript does bitwise operations (like XOR, above) on 32-bit signed
   * integers. Since we want the results to be always positive, convert the
   * signed int to an unsigned by doing an unsigned bitshift. */
  return hash >>> 0;
}

/*function ff (){
  var al = [65, 90];
  var au = [97, 122];
  for (var i=65, l=122; i <= l; i++) {
    if (i > 90 && i < 97) {
      i = 97;
    }
  }
}*/

var HASHES = {};
CssModules.scope.generateScopedName = function (name, filename, css) {
  var hash = stringHash([name, filename, css].join('-')).toString(36);
  if (hash[0] == Number(hash[0])) {
    hash = '_' + hash;
  }
  return hash; 
  var hash;
  var matches = css.match(new RegExp(`\\.${name}`, 'g'));
  //console.error('name', name, 'matches', matches.length, new RegExp(`\.${name}`));
  if (matches.length > 1) {
    hash = stringHash([name, filename, css].join('-')).toString(36);
  } else {
    var reg = new RegExp(`\\.${name}[^\\{]*\\{([^\\}]*)\\}`);
    var executed = reg.exec(css);
    var rule;
    if (executed && executed[1]) {
      rule = executed[1];
    } else {
      rule = css;
      console.error('not matched selector', reg, 'name', name, 'filename', filename, 'css', css);
    }
    //console.error('\n-------\nname: ', name, '\nreg:', reg, '\nexec:', executed, '\nfilename: ', filename, '\nrule: ', rule, '\ncss: \n', css, '\n');
    hash = stringHash(rule).toString(36);
    if (hash[0] == Number(hash[0])) {
      hash = '_' + hash;
    }
  }
  
  //return '';
  return hash;
};

const cssModules = new CssModules();
export default function (options = {}) {
  const filter = createFilter(options.include, options.exclude);
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
      const relativePath = relative(process.cwd(), id);
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
      //console.log('writing css to:', options.output);
      fs.writeFile(options.output, cssfile.join(''));
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
    //console.log('sourcePath', sourcePath);
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
    //console.log('pathFetcher', sourcePath);
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
