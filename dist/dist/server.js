'use strict';var _parse=require('./parse');var _parse2=_interopRequireDefault(_parse);var _express=require('express');var _express2=_interopRequireDefault(_express);var _bodyParser=require('body-parser');var _bodyParser2=_interopRequireDefault(_bodyParser);function _interopRequireDefault(obj){return obj&&obj.__esModule?obj:{default:obj};}var app=(0,_express2.default)();app.set('port',process.env.PORT||8000);app.set('view engine','ejs');app.use(_bodyParser2.default.urlencoded({extended:true}));//app.use(cookieParser('foobarbazqux'));
app.use(_express2.default.static('public'));module.exports={app:app,express:_express2.default,Parse:_parse2.default};
//# sourceMappingURL=server.js.map