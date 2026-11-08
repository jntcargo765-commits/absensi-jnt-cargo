'use strict';

/** Membuat Error dengan status HTTP agar bisa ditangani handler terpusat. */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.terbuka = true;
  return error;
}

/** Membungkus handler async supaya error diteruskan ke Express. */
function asinkron(handler) {
  return function pembungkus(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { httpError, asinkron };
