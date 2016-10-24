'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _server = require('./server');

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _config = require('config');

var _config2 = _interopRequireDefault(_config);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _requestPromise = require('request-promise');

var _requestPromise2 = _interopRequireDefault(_requestPromise);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//import parseExpressHttpsRedirect from 'parse-express-https-redirect'
//import parseExpressCookieSession from './src/parse-express-cookie-session/index'

// App Secret can be retrieved from the App Dashboard
var APP_SECRET = process.env.MESSENGER_APP_SECRET ? process.env.MESSENGER_APP_SECRET : _config2.default.get('APP_SECRET');

// Arbitrary value used to validate a webhook
var VALIDATION_TOKEN = process.env.MESSENGER_VALIDATION_TOKEN ? process.env.MESSENGER_VALIDATION_TOKEN : _config2.default.get('VALIDATION_TOKEN');

// Generate a page access token for your page from the App Dashboard
var PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN ? process.env.MESSENGER_PAGE_ACCESS_TOKEN : _config2.default.get('PAGE_ACCESS_TOKEN');

// URL where the app is running (include protocol). Used to point to scripts and
// assets located at this address.
var SERVER_URL = process.env.SERVER_URL ? process.env.SERVER_URL : _config2.default.get('SERVER_URL');

var FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID ? process.env.FACEBOOK_APP_ID : _config2.default.get('FACEBOOK_APP_ID');

var REDIRECT_URI = process.env.REDIRECT_URI ? process.env.REDIRECT_URI : _config2.default.get('REDIRECT_URI');

var limit = 9;

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
    console.error("Missing config values");
    process.exit(1);
}

_server.app.use(_bodyParser2.default.json({ verify: verifyRequestSignature }));
//app.use(parseExpressHttpsRedirect());
//app.use(parseExpressCookieSession({ fetchUser: true }));

var listener = {};
var buffer = {};
var rules = new Map();
var payloadRules = new Map();

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = _crypto2.default.createHmac('sha1', APP_SECRET).update(buf).digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.

    senderID = parseInt(senderID);
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " + "through param '%s' at %d", senderID, recipientID, passThroughParam, timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've
 * created. If we receive a message with an attachment (image, video, audio),
 * then we'll simply confirm that we've received the attachment.
 *
 */
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    senderID = parseInt(senderID);

    if (isEcho) {
        // Just logging message echoes to console
        console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
        return;
    } else if (quickReply) {
        var quickReplyPayload = quickReply.payload;
        //console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
        var payloadFunction;

        if (quickReplyPayload.includes('-')) {
            var params = quickReplyPayload.split('-');
            payloadFunction = payloadRules.get(params[0]);
            //console.log(senderID);
            //console.log(typeof senderID);
            if (payloadFunction) {
                payloadFunction(senderID, params[1]);
            }
        } else {
            payloadFunction = payloadRules.get(quickReplyPayload);

            if (payloadFunction) {
                payloadFunction(senderID);
            }
            /*
             payloadFunction = findKeyStartsWith(payloadRules, quickReplyPayload);
             if(payloadFunction){
             payloadFunction(senderID);
             }*/
        }
        //sendTextMessage(senderID, "Quick reply tapped");

        return;
    } else if (messageText) {
        // If we receive a text message, check to see if it matches any special
        // keywords and send back the corresponding example. Otherwise, just echo
        // the text we received.

        //Object.keys(listener);
        var userListeners = listener[senderID];
        var existRule = false;
        //console.log(senderID);
        //console.log(typeof senderID);

        if (!_.isEmpty(userListeners)) {
            if (!buffer[senderID]) {
                buffer[senderID] = {};
            }
            var keys = Object.keys(userListeners);
            var key = keys.shift();

            //console.log('User Listeners');

            while (key) {
                //console.log(key);
                if (userListeners[key].type == 'text') {
                    buffer[senderID][key] = messageText;
                    userListeners[key].callback(senderID);
                    existRule = true;
                }
                delete userListeners[key];
                key = keys.shift();
            }
        } else {
            messageText = messageText.toLowerCase();

            rules.forEach(function (value, key) {
                if (messageText.includes(key)) {
                    value(senderID);
                    existRule = true;
                }
            });
        }

        if (!existRule) {
            //console.log(messageText);
            //console.log(defaultSearch);
            defaultSearch(senderID, messageText);
        }
        /*
           switch (messageText) {
         case 'image':
         sendImageMessage(senderID);
         break;
          case 'gif':
         sendGifMessage(senderID);
         break;
          case 'audio':
         sendAudioMessage(senderID);
         break;
          case 'video':
         sendVideoMessage(senderID);
         break;
          case 'file':
         sendFileMessage(senderID);
         break;
          case 'button':
         sendButtonMessage(senderID);
         break;
          case 'generic':
         sendGenericMessage(senderID);
         break;
          case 'receipt':
         sendReceiptMessage(senderID);
         break;
          case 'quick reply':
         sendQuickReply(senderID);
         break;
          case 'read receipt':
         sendReadReceipt(senderID);
         break;
          case 'typing on':
         sendTypingOn(senderID);
         break;
          case 'typing off':
         sendTypingOff(senderID);
         break;
          case 'account linking':
         sendAccountLinking(senderID);
         break;
          default:
         sendTextMessage(senderID, messageText);
         }
         /*
         if (messageText.indexOf("hola") > -1){
         sendMenuMessage(senderID);
         }
         else if (messageText.indexOf("buenos dias") > -1){
         sendMenuMessage(senderID);
         }
         else if (messageText.indexOf("menu del dia") > -1){
         sendMenuMessage(senderID);
         }
         else if (messageText.indexOf("cuenta") > -1){
         sendBillMessage(senderID);
         }
         */
    } else if (messageAttachments) {
        if (messageAttachments[0].type == 'location') {
            var location = messageAttachments[0].payload.coordinates;
            var userListeners = listener[senderID];
            //console.log(senderID);
            //console.log(typeof senderID);
            if (!_.isEmpty(userListeners)) {
                if (!buffer[senderID]) {
                    buffer[senderID] = {};
                }
                var keys = Object.keys(userListeners);
                var key = keys.shift();

                while (key) {
                    console.log(key);
                    if (userListeners[key].type == 'attachment') {
                        buffer[senderID][key] = { lat: location.lat, lng: location.long };
                        userListeners[key].callback(senderID);
                    }
                    delete userListeners[key];
                    key = keys.shift();
                }
            }
        }
        //sendTextMessage(senderID, "Message with attachment received");
    }
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    senderID = parseInt(senderID);

    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            //console.log("Received delivery confirmation for message ID: %s", messageID);
        });
    }

    //console.log("All message before %d were delivered.", watermark);
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    //console.log("Received postback for user %d and page %d with payload '%s' " + "at %d", senderID, recipientID, payload, timeOfPostback);

    // When a postback is called, we'll send a message back to the sender to
    // let them know it was successful

    var payloadFunction;

    var params = payload.split('-');

    payloadFunction = payloadRules.get(params[0]);
    senderID = parseInt(senderID);

    //console.log(senderID);
    //console.log(typeof senderID);

    if (payloadFunction) {
        switch (params.length) {
            case 1:
                payloadFunction(senderID);
                break;
            case 2:
                payloadFunction(senderID, params[1]);
                break;
            case 3:
                payloadFunction(senderID, params[1], params[2]);
                break;
            default:
                console.log('Payload not found: ' + params);
        }
    }

    /*
    if(payload == 'Greeting'){
        sendMenuMessage(senderID);
    }
    else if(payload == 'Delivery'){
        sendMenuMessage(senderID);
    }
    else if(payload.startsWith("ListCategories")){
        var params = payload.split("-");
        console.log("List Categories");
        console.log(params);
        listCategories(senderID, parseInt(params[1]));
    }
    else if(payload.startsWith("ListProducts")){
        var params = payload.split("-");
        listProducts(senderID, params[1], parseInt(params[2]));
    }
    else if(payload.startsWith("Add")){
        var params = payload.split("-");
        addProduct(params[1]);
    }
    else if(payload.startsWith("ShoppingCart")){
        sendBillMessage(senderID);
    }
    else{
        sendTextMessage(senderID, "Postback called "+payload);
    }
    */
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    senderID = parseInt(senderID);

    console.log("Received message read event for watermark %d and sequence " + "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    senderID = parseInt(senderID);

    console.log("Received account link event with for user %d with status %s " + "and auth code %s ", senderID, status, authCode);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData, callback) {
    (0, _request2.default)({
        uri: 'https://graph.facebook.com/v2.7/me/messages',
        qs: { access_token: PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                if (callback) callback(recipientId);
                //console.log("Successfully sent message with id %s to recipient %s", messageId, recipientId);
            } else {
                    //console.log("Successfully called Send API for recipient %s", recipientId);
                }
        } else {
            console.error(response);
            console.error(body);
            console.error(error);
        }
    });
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
    //console.log("Turning typing indicator on");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
    //console.log("Turning typing indicator off");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/rift.png"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendVideoMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: SERVER_URL + "/assets/allofus480.mov"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendFileMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: SERVER_URL + "/assets/test.txt"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "This is test text",
                    buttons: [{
                        type: "web_url",
                        url: "https://www.oculus.com/en-us/rift/",
                        title: "Open Web URL"
                    }, {
                        type: "postback",
                        title: "Trigger Postback",
                        payload: "DEVELOPED_DEFINED_PAYLOAD"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "rift",
                        subtitle: "Next-generation virtual reality",
                        item_url: "https://www.oculus.com/en-us/rift/",
                        image_url: SERVER_URL + "/assets/rift.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/rift/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for first bubble"
                        }]
                    }, {
                        title: "touch",
                        subtitle: "Your Hands, Now in VR",
                        item_url: "https://www.oculus.com/en-us/touch/",
                        image_url: SERVER_URL + "/assets/touch.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/touch/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for second bubble"
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: "Peter Chang",
                    order_number: receiptId,
                    currency: "COP",
                    payment_method: "Visa 1234",
                    timestamp: "1428444852",
                    elements: [{
                        title: "Oculus Rift",
                        subtitle: "Includes: headset, sensor, remote",
                        quantity: 1,
                        price: 599.00,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/riftsq.png"
                    }, {
                        title: "Samsung Gear VR",
                        subtitle: "Frost White",
                        quantity: 1,
                        price: 99.99,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/gearvrsq.png"
                    }],
                    address: {
                        street_1: "1 Hacker Way",
                        street_2: "",
                        city: "Menlo Park",
                        postal_code: "94025",
                        state: "CA",
                        country: "US"
                    },
                    summary: {
                        subtotal: 698.99,
                        shipping_cost: 20.00,
                        total_tax: 57.67,
                        total_cost: 626.66
                    },
                    adjustments: [{
                        name: "New Customer Discount",
                        amount: -50
                    }, {
                        name: "$100 Off Coupon",
                        amount: -100
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What's your favorite movie genre?",
            metadata: "DEVELOPER_DEFINED_METADATA",
            quick_replies: [{
                "content_type": "text",
                "title": "Action",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
            }, {
                "content_type": "text",
                "title": "Comedy",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
            }, {
                "content_type": "text",
                "title": "Drama",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
            }]
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
    console.log("Sending a read receipt to mark message as seen");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

function findKeyStartsWith(map, str) {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = map[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _step$value = _slicedToArray(_step.value, 2);

            var key = _step$value[0];
            var value = _step$value[1];

            if (key.startsWith(str)) return value;
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
            }
        } finally {
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }

    return undefined;
}

function getFacebookUser(recipientId, callback) {
    return (0, _requestPromise2.default)({
        uri: 'https://graph.facebook.com/v2.7/' + recipientId,
        qs: { access_token: PAGE_ACCESS_TOKEN, fields: 'first_name,last_name,locale,timezone,gender' },
        method: 'GET'
    }).then(function (body) {
        return JSON.parse(body);
    }).catch(function (error) {
        console.log('error');
        console.log(error);
    });

    /*
    if (!error && response.statusCode == 200) {
        var pathname = response.request.uri.pathname;
        var recipientId = pathname.split('/').pop();
        var userData = JSON.parse(body);
        var commerce = new Parse.Query(ParseModels.Customer);
         //user.equalTo('authData', {"facebook":        {"access_token":"EAAPK2ME0gLkBAE6HMBKLP2RfquPvCIyaXNuItGYRdBpJNArGCZC9UzITl9ZBB7EKnmuukylXS93yhHOZAUiHjPwGyNBmnb11VPB7kf0Km9o2Gm2hFSJhDmjpZA1bfZCITRQ45OCMVAIWSR3jHIjkg3cze6tSvZBQjKdGkalGA1V7E0npkZAcMPn51z2yLAPJVRzRpbTqNCTtNPIhxpBr7H2","expiration_date":"2016-10-02T15:16:42.000Z","id":"10210218101474882"}})
         commerce.contains('businessId', BUSINESS_ID);
         commerce.find().then(function(results){
                var currentUser = Parse.User.current();
                var image_url = results[0].get('image').url();
                 console.log('data');
                console.log(userData);
                console.log(recipientId);
                console.log(results);
                console.log(image_url);
                  var messageData = {
                    recipient: {
                        id: recipientId
                    },
                    message: {
                        attachment: {
                            type: "template",
                            payload: {
                                template_type: "generic",
                                //text: "Buenos dias, para conocer nuestros menus del dia, por favor escoja una opción:",
                                elements: [{
                                    "title":     "Hola "+userData.first_name+", Bienvenido a OXXO. ",
                                    "subtitle":  "Aquí puedes pedir un domicilio, escribe o selecciona alguna de las opciones:",
                                    "image_url": image_url,
                                    "buttons":[
                                        {
                                            "type":"postback",
                                            "title":"Pedir domicilio",
                                            "payload":"ListCategories-0"
                                        },
                                        {
                                            "type":"postback",
                                            "title":"Pedir para recoger",
                                            "payload":"ListCategories-0"
                                        },
                                        {
                                            "type":"postback",
                                            "title":"Servicio al cliente",
                                            "payload":"ListCategories-0"
                                        }
                                    ]
                                }]
                            }
                        }
                    }
                };
                 bot.sendTypingOff(recipientId);
                bot.callSendAPI(messageData);
            },
            function(error) {
                console.log("Lookup failed");
            });
    } else {
        console.error(response.error);
    }*/
}

function setListener(recipientId, dataId, type, callback) {
    if (typeof listener[recipientId] == 'undefined') {
        listener[recipientId] = {};
    }

    listener[recipientId][dataId] = { callback: callback, type: type };

    /*
     // input dataId =  consumerAddress[address]
     var id;
    var ref = listener[recipientId]
    var elements = dataId.split(/[\[|\]]+/g).filter(function(el) {return el.length != 0});
     while(elements.length != 0){
        id = elements.shift();
        if(elements.length == 0){
            ref[id] = callback
        }
        else if(!ref[id]){
            ref[id] = {}
        }
        ref = ref[id];
    };*/
}

function getListener(recipientId, dataId) {
    if (typeof listener[recipientId] == 'undefined') {
        return undefined;
    }

    return listener[recipientId][dataId];
    /*
      // input dataId =  consumerAddress[address]
      var id;
     var ref = listener[recipientId]
     var elements = dataId.split(/[\[|\]]+/g).filter(function(el) {return el.length != 0});
      while(elements.length != 0){
     id = elements.shift();
     if(elements.length == 0){
     ref[id] = callback
     }
     else if(!ref[id]){
     ref[id] = {}
     }
     ref = ref[id];
     };*/
}

function deleteListener(recipientId, dataId) {
    if (!listener[recipientId]) {
        return false;
    }

    delete listener[recipientId][dataId];
    return true;
}

function defaultSearch(recipientId, query) {
    //console.log('defaultSearch');
    //console.log(search);
    var search = payloadRules.get('Search');

    if (search) {
        search(recipientId, query);
    }
};

/*
 * Use your own validation token. Check that the token used in the Webhook
 * setup is the same token used here.
 *
 */
_server.app.get('/webhook', function (req, res) {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VALIDATION_TOKEN) {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
_server.app.post('/webhook', function (req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                //console.log(messagingEvent);
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
});

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL.
 *
 */
_server.app.get('/authorize', function (req, res) {
    var accountLinkingToken = req.query['account_linking_token'];
    var redirectURI = req.query['redirect_uri'];

    // Authorization Code should be generated per user by the developer. This will
    // be passed to the Account Linking callback.
    var authCode = "1234567890";

    // Redirect users to this URI on successful login
    var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

    res.render('authorize', {
        accountLinkingToken: accountLinkingToken,
        redirectURI: redirectURI,
        redirectURISuccess: redirectURISuccess
    });
});

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid
// certificate authority.
_server.app.listen(_server.app.get('port'), function () {
    //console.log('Node app is running on port', app.get('port'));
});

module.exports = { app: _server.app, Parse: _server.Parse, rules: rules, payloadRules: payloadRules, buffer: buffer, listener: listener, limit: limit, defaultSearch: defaultSearch, callSendAPI: callSendAPI, sendTypingOn: sendTypingOn, sendTypingOff: sendTypingOff, getFacebookUser: getFacebookUser, setListener: setListener, getListener: getListener, deleteListener: deleteListener };