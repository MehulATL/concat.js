var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var _ = require('underscore');

// .then converts whatever is returned from the function passed into it into a promise object
var directory = '/*YOUR DIRECTORY PATH HERE*/';

fs.readdirAsync(directory)
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
    return fs.readFileAsync(path.join(directory,dir), 'utf8');
  }));
})
.then(function(arrayOfContents) {
  var contents = _.reduce(arrayOfContents, function(memo, value) {
    return memo+value;
  }, '');
  return fs.writeFileAsync('output.js', contents);
})
.then(function(){
  console.log('Files successfully concated into ouput.js.');
});
