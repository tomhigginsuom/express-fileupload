var busboy = require('connect-busboy');
var fs = require('fs-extra');
var streamifier = require('streamifier');

module.exports = function(options) {
  options = options || {};

  return function(req, res, next) {
    return busboy(options)(req, res, function() {

      // If no busboy req obj, then no uploads are taking place
      if (!req.busboy)
        return next();

      req.files = null;

      req.busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
        req.body = req.body || {};
        var prev = req.body[fieldname];
        if (!prev) return req.body[fieldname] = val;
        if (Array.isArray(prev)) return prev.push(val);
        req.body[fieldname] = [prev, val];
      });

      req.busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        var buf = new Buffer(0);
        var safeFileNameRegex = /[^\w-]/g;

        file.on('data', function(data) {
          buf = Buffer.concat([buf, data]);

          if (options.debug) {
            return console.log('Uploading %s -> %s', fieldname, filename);
          }
        });

        file.on('end', function() {
          if (!req.files)
            req.files = {};
          
          // see: https://github.com/richardgirges/express-fileupload/issues/14
          // firefox uploads empty file in case of cache miss when f5ing page.
          // resulting in unexpected behavior. if there is no file data, the file is invalid.
          if(!buf.length) 
            return;

          if (options.safeFileNames) {
            if (typeof options.safeFileNames === 'object')
              safeFileNameRegex = options.safeFileNames;

            filename = filename.replace(safeFileNameRegex, '');

            console.log('filename yo', filename);
          }

          var newFile = {
            name: filename,
            data: buf,
            encoding: encoding,
            mimetype: mimetype,
            mv: function(path, callback) {
              var fstream;
              fstream = fs.createWriteStream(path);
              streamifier.createReadStream(buf).pipe(fstream);
              fstream.on('error', function(error) {
                callback(error);
              });
              fstream.on('close', function() {
                callback(null);
              });
            }
          };

          if (!req.files.hasOwnProperty(fieldname)) {
            req.files[fieldname] = newFile;
          } else {
            if (req.files[fieldname] instanceof Array)
                req.files[fieldname].push(newFile);
            else
                req.files[fieldname] = [req.files[fieldname], newFile];
          }
        });
      });

      req.busboy.on('finish', next);

      req.pipe(req.busboy);
    });
  };
};
