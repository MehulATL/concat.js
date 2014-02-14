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
});