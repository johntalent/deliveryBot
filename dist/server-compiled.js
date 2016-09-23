'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

var app = (0, _express2.default)();
app.set('port', process.env.PORT || 8000);
app.set('view engine', 'ejs');
app.use(_express2.default.static('public'));

module.exports = app;

//# sourceMappingURL=server-compiled.js.map