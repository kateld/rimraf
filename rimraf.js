module.exports = rimraf
rimraf.sync = rimrafSync

var path = require("path")
  , fs

try {
  // optional dependency
  fs = require("graceful-fs")
} catch (ex) {
  fs = require("fs")
}

// for EBUSY handling
var waitBusy = {}

// for EMFILE handling
var resetTimer = null
  , timeout = 0

function rimraf (p, opts, cb) {
  if (typeof opts === "function") cb = opts, opts = {}

  opts.maxBusyTries = opts.maxBusyTries || 3

  rimraf_(p, opts, function (er) {
    if (er) {
      if (er.message.match(/^EBUSY/)) {
        // windows is annoying.
        if (!waitBusy.hasOwnProperty(p)) waitBusy[p] = opts.maxBusyTries
        if (waitBusy[p]) {
          waitBusy[p] --
          // give it 100ms more each time
          var time = (opts.maxBusyTries - waitBusy[p]) * 100
          return setTimeout(function () { rimraf_(p, opts, cb) }, time)
        }
      }

      // this one won't happen if graceful-fs is used.
      if (er.message.match(/^EMFILE/)) {
        return setTimeout(function () {
          rimraf_(p, opts, cb)
        }, timeout ++)
      }
    }
    timeout = 0
    cb(er)
  })
}

function asyncForEach (list, fn, cb) {
  if (!list.length) cb()
  var c = list.length
    , errState = null
  list.forEach(function (item, i, list) {
    fn(item, function (er) {
      if (errState) return
      if (er) return cb(errState = er)
      if (-- c === 0) return cb()
    })
  })
}

function rimraf_ (p, opts, cb) {
  fs.lstat(p, function (er, s) {
    // if the stat fails, then assume it's already gone.
    if (er) return cb()

    // don't delete that don't point actually live in the "gently" path
    if (opts.gently) return clobberTest(p, s, opts, cb)
    return rm_(p, s, opts, cb)
  })
}

function rm_ (p, s, opts, cb) {
  if (!s.isDirectory()) return fs.unlink(p, cb)
  fs.readdir(p, function (er, files) {
    if (er) return cb(er)
    asyncForEach(files.map(function (f) {
      return path.join(p, f)
    }), function (file, cb) {
      rimraf(file, opts, cb)
    }, function (er) {
      if (er) return cb(er)
      fs.rmdir(p, cb)
    })
  })
}

function clobberTest (p, s, opts, cb) {
  var gently = opts.gently
  if (!s.isSymbolicLink()) next(null, path.resolve(p))
  else realish(p, next)

  function next (er, rp) {
    if (er) return rm_(p, s, cb)
    if (rp.indexOf(gently) !== 0) return clobberFail(p, cb)
    else return rm_(p, s, opts, cb)
  }
}

function realish (p, cb) {
  fs.readlink(p, function (er, r) {
    if (er) return cb(er)
    return cb(null, path.resolve(path.dirname(p), r))
  })
}

// this looks simpler, but it will fail with big directory trees,
// or on slow stupid awful windows filesystems,
// and it's potentially slower, since the functional async version will
// actually delete several things at once.
function rimrafSync (p) {
  var s = fs.lstatSync(p)
  if (!s.isDirectory()) return fs.unlinkSync(p)
  fs.readdirSync(p).forEach(function (f) {
    rimrafSync(path.join(p, f))
  })
  fs.rmdirSync(p)
}
