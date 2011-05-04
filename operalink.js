/*
 * Copyright 2011 Joel Spadin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This library facilitates making requests to the Opera Link synchronization
 * server. It is intended for use in Opera extensions, but it can be used in any
 * situation where JavaScript security allows cross domain XML HTTP requests.
 * 
 * This library depends on oauth.js and sha1.js, which can be found here:
 * http://oauth.googlecode.com/svn/code/javascript/
 * 
 * Before sending any requests to Opera Link, you must first authenticate with
 * OAuth. To do this, your application needs a consumer key and secret, which
 * you can obtain by registering your application at
 * https://auth.opera.com/service/oauth/applications/
 * 
 * Call opera.link.consumer() with your application's consumer key and secret.
 * Now, each user needs their own token and token secret. A full explanation of
 * the authentication process can be found at
 * http://dev.opera.com/articles/view/gentle-introduction-to-oauth/
 * 
 * This library simplifies the process somewhat. Call opera.link.requestToken()
 * to get a request token and token secret (steps 1-5). Save these values so
 * that you can recall them once the user grants access to your application. 
 * This function will automatically send the user to the authorization page if
 * used in an Opera extension. If the extensions API is not available, you must
 * set opera.link.authorizeFunction and handle the opening of the authorization
 * page yourself.
 * 
 * Once the user grants access to your application (step 6), they will get a 
 * 6-digit verifier code (step 7). Call opera.link.getAccessToken with the 
 * request token, token secret, and the verifier to get an access token and 
 * token secret (steps 8,9). 
 * You should save the access token and token secret to permanent storage so
 * they can be recalled later and the user will not have to repeat the 
 * authentication process.
 * 
 * To set up authentication from a saved access token, call 
 * opera.link.authorize() with the saved token and token secret. Next, check 
 * that the grant has not expired by calling opera.link.testAuthorization(). If
 * the grant has expired, you will need to redo the full authentication process.
 * 
 * 
 * opera.link provides methods to set up authentication and send OAuth signed
 *		requests.
 *		
 *	opera.link.utils provides generic methods and methods common to all datatypes
 *	
 *	opera.link.bookmarks, opera.link.notes, opera.link.searchengines,
 *	opera.link.speeddial, and opera.link.urlfilter provide access to each of the
 *		data types supported by Opera Link.
 *		
 *	Documentation on the parameters of specific request types can be found here:
 *	http://www.opera.com/docs/apis/linkrest/
 *	
 *	Examples using the Opera Link API can be found here:
 *	http://dev.opera.com/articles/view/introducing-the-opera-link-api/
 */


try {
	opera;
} catch (error) {
	/**
	 * @namespace Opera
	 */
	opera = new function Opera() {

		/*// compatibility with Google Chrome
		if (chrome) {
			this.extension = new function () {
				this.tabs = new function () {
					this.create = function (options) {
						chrome.tabs.create({url: options.url, selected: options.focused == undefined ? true : options.focused});
					};
				};
			};
		}*/
	};
}

try {
	widget;
} catch (error) {
	var widget = undefined;
}


/**
 * @namespace Handles communication and authentication with the Opera Link server.
 * @requires Add access to https://auth.opera.com and https://link.api.opera.com 
 * in your extension's config.xml. Requires oauth.js and sha.js.
 */
opera.link = new function OperaLink() {
	
	/**
	 * @class A list of the response codes used by Opera Link
	 * @static
	 */
	this.response = {
		/**
		 * 200: The request completed successfully.
		 * @constant
		 */
		Ok: 200,
		/**
		 * 204 : The item was successfully deleted.
		 * @constant
		 */
		Deleted: 204,
		/**
		 * 400 : The request is invalid and cannot be processed. The cause of this is
		 * often missing a required parameter or trying to execute an invalid
		 * method on an item.
		 * @constant
		 */
		BadRequest: 400,
		/**
		 * 401 : The request cannot be allowed, possibly because your authentication
		 * information is invalid or because too many requests sent in a short
		 * period made the throttling ban them.
		 * @constant
		 */
		Unauthorized: 401,
		/**
		 * 404 : The item you seek or wish to manipulate was not found
		 * @constant
		 */
		NotFound: 404,
		/**
		 * 405 : The method you tried to use is not allowed
		 * @constant
		 */
		MethodNotAllowed: 405,
		/**
		 * 500 : This is an unexpected server error.
		 * @constant
		 */
		InternalServerError: 500,
		/**
		 * 501 : You are trying to execute a method that is not implemented. This can
		 * happen when you execute a method that is not supported by the specific
		 * datatype or if you misspelled a method name in the request.
		 * @constant
		 */
		NotImplemented: 501
	}
	
	/**
	 * The location of the Opera Link REST API
	 * @type String
	 */
	this.apiurl = 'https://link.api.opera.com/rest/';
	
	/**
	 * If true, the results of actions that only return one object will be 
	 * simplified from an array containing one object to just the one object.
	 * Defaults to true.
	 * @type Boolean
	 */
	this.simplifyResults = true;
	
	/**
	 * If using this library outside of extensions, opera.link.requestToken will
	 * call this function instead of opera.extension.tabs.create to show the user
	 * the authorization page. The function should take one parameter, the url
	 * of the authorization page.
	 * @type Function
	 */
	this.authorizeFunction = null;
	
	/**
	 * Sets the storage object used by saveToken and loadToken
	 * @type Storage
	 */
	this.storage = (widget && widget.preferences) ? widget.preferences : localStorage;
	
	
	/**
	 * Authentication parameters for OAuth
	 * @private
	 */
	var accessor = {
		consumerKey : null,
		consumerSecret: null,
		token: null,
		tokenSecret: null,
	}

	/**
	 * Parameters used for OAuth authentication. Don't change these unless you 
	 * know what you're doing.
	 */
	this.provider = {
		signatureMethod: 'HMAC-SHA1',
		requestTokenURL: 'https://auth.opera.com/service/oauth/request_token',
		userAuthorizationURL: 'https://auth.opera.com/service/oauth/authorize',
		accessTokenURL: 'https://auth.opera.com/service/oauth/access_token',
	}
	
	
	/**
	 * Sends an OAuth GET request to the specified URL
	 * @param {String} url The location to send the request
	 * @param {Object} params The data to send. Use null for no data
	 * @param {Function(xhr)} callback Function called when the request completes.
	 *		The callback is passed one argument: the XMLHttpRequest object used
	 */
	this.get = function(url, params, callback) {
		var message = {
			action: url,
			method: 'GET',
			parameters: params
		}
		
		OAuth.completeRequest(message, accessor);
		url += '?' + OAuth.formEncode(message.parameters);
		
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4)
				callback(xhr);
		}
	
		xhr.open(message.method, url, true);
		xhr.send(null);
	}
	
	/**
	 * Sends an OAuth POST request to the specified URL
	 * @param {String} url The location to send the request
	 * @param {Object} params The data to send. Use null for no data
	 * @param {Function(xhr)} callback Function called when the request completes.
	 *		The callback is passed one argument: the XMLHttpRequest object used.
	 */
	this.post = function(url, params, callback) {
		var message = {
			action: url,
			method: 'POST',
			parameters: null	// parameters do not get signed when posting JSON data
		}
		
		var requestBody = JSON.stringify(params);
		OAuth.completeRequest(message, accessor);
		var authorizationHeader = OAuth.getAuthorizationHeader('', message.parameters);
		
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4)
				callback(xhr);
		}
	
		xhr.open(message.method, message.action, true);
		xhr.setRequestHeader('Authorization', authorizationHeader);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.send(requestBody);
	}
	
	/**
	 * Sets the OAuth consumer key and secret. These are given to you when you
	 * set up a new application with Opera Link and are specific to your application.
	 * @param {String} key The application's consumer key
	 * @param {String} secret The application's consumer secret
	 */
	this.consumer = function(key, secret) {
		accessor.consumerKey = key;
		accessor.consumerSecret = secret;
	}
	
	/**
	 * Sets the OAuth access token and token secret. These are specific to each user.
	 * @param {String} token The user's access token
	 * @param {String} secret The user's access token secret
	 */
	this.authorize = function(token, secret) {
		accessor.token = token;
		accessor.tokenSecret = secret;
	}
	
	/**
	 * Requests a new request token. This will open a new tab where the user can
	 * grant access to your application. The resulting request token, token secret,
	 * and 6-digit verifier must be used with opera.link.getAccessToken to get a
	 * permanent access token.
	 * @param {Function(data)} callback Function that is called if the request
	 *		succeeds. The callback is passed one argument, an object with two
	 *		properties: "token", the temporary request token, and "secret", the
	 *		secret that goes with the token.
	 * @param {Function(xhr)} [error] Function that is called if the request fails. 
	 *		The function is passed one argument: the XMLHttpRequest object used.
	 */
	this.requestToken = function(callback, error) {
		this.getRequestToken(function success(e) {
			opera.link.authorizeRequestToken(e.token);
			callback(e);
		}, error);
	}
	
	/**
	 * Requests a new access token.
	 * @param {String} requestToken The request token
	 * @param {String} requestSecret The request token secret
	 * @param {String} verifier The 6-digit verifier code
	 * @param {Function(data)} callback Function that is called if the request
	 *		succeeds. The callback is passed one argument, an object with two
	 *		properties: "token", the access token, and "secret", the secret that 
	 *		goes with the token.
	 * @param {Function(xhr)} [error] Function that is called if the request fails. 
	 *		The function is passed one argument: the XMLHttpRequest object used.
	 */
	this.getAccessToken = function(requestToken, requestSecret, verifier, callback, error) {
		this.authorize(requestToken, requestSecret);
		
		this.get(this.provider.accessTokenURL, {
			'oauth_signature_method': this.provider.signatureMethod,
			'oauth_verifier': verifier,
		}, function(xhr) {
			if (xhr.status == 200) {
				var params = parseResponse(xhr.responseText);
				opera.link.authorize(params.oauth_token, params.oauth_token_secret);
				callback({token: params.oauth_token, secret: params.oauth_token_secret});
			}
			else if (error)
				error(xhr);
		});
	}
	
	/**
	 * Tests whether the current authentication tokens are valid
	 * @param {Function(success)} callback Function which is called with the 
	 *		result of the test. The function is passed one argument: true if 
	 *		the authorization parameters are correct or false otherwise.
	 */
	this.testAuthorization = function(callback) {
		this.get(this.apiurl + 'bookmark', null, function(xhr) {
			callback(xhr.status != opera.link.response.Unauthorized);
		});
	}
	
	
	
	
	this.getRequestToken = function(callback, error) {
		this.get(this.provider.requestTokenURL, {
				'oauth_signature_method': this.provider.signatureMethod,
				'oauth_callback': 'oob',
			}, function (xhr) {		
				if (xhr.status == 200) {
					var params = parseResponse(xhr.responseText);
					callback({token: params.oauth_token, secret: params.oauth_token_secret});
				}
				else if (error)
					error(xhr);
			}
		);
	}
	
	this.authorizeRequestToken = function(requestToken) {
		var message = {
			action: this.provider.userAuthorizationURL,
			method: 'GET',
			parameters: {
				'oauth_signature_method': this.provider.signatureMethod,
				'oauth_callback': 'oob',
				'oauth_token': requestToken,
			}
		}
		
		OAuth.completeRequest(message, accessor);
		var url = message.action + '?' + OAuth.formEncode(message.parameters);
		
		if (this.authorizeFunction)
			this.authorizeFunction(url)
		else
			opera.extension.tabs.create({url: url, focused: true});
	}
	
	/**
	 * Saves the current OAuth token and token secret to storage in the values
	 * oauth_token and oauth_secret.
	 */
	this.saveToken = function() {
		this.storage['oauth_token'] = JSON.stringify(accessor.token);
		this.storage['oauth_secret'] = JSON.stringify(accessor.tokenSecret);
	}
	
	/**
	 * Loads the OAuth token and token secret stored in the values oauth_token 
	 * and oauth_secret.
	 * @returns {Boolean} True if there were token values to load, false otherwise
	 */
	this.loadToken = function() {
		var token = JSON.parse(this.storage['oauth_token'] || null);
		var secret = JSON.parse(this.storage['oauth_secret'] || null);
		
		if (token && secret) {
			this.authorize(token, secret);
			return true;
		}
		return false;
	}

	/**
	 * Deletes the saved OAuth token and token secret from storage
	 */
	this.clearSavedToken = function() {
		this.storage.removeItem('oauth_token');
		this.storage.removeItem('oauth_secret');
	}


	/**
	 * Parses the response of a token request
	 * @private
	 */
	var parseResponse = function(q) {
		var items = q.split('&');
		var result = {};
		for (var i = 0; i < items.length; i++) {
			var temp = items[i].split('=');
			var key = decodeURIComponent(temp[0].replace(/\+/g, '%20'));
			var value = decodeURIComponent(temp[1].replace(/\+/g, '%20'));
			result[key] = value;
		}
		return result;
	}
}


/**
 * @namespace Utility methods and methods common to all datatypes
 */
opera.link.util = new function OperaLinkUtils() {
	
	/**
	 * Gets the properties of the requested item
	 * @param {String} datatype The item type
	 * @param {String} item The item id
	 * @param {null|Object} params Extra parameters for the request. 
	 *		Use null if no parameters are needed.
	 * @param {Function(data)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.get = function(datatype, item, params, callback) {
		var url = opera.link.apiurl + datatype + '/' + item;
		if (url[url.length - 1] != '/')
			url += '/';
		
		opera.link.get(url, completeParams(params), function(xhr) {
			var response = xhr.status == opera.link.response.Ok ? 
				JSON.parse(xhr.responseText || 'null') : xhr.responseText;
			callback({
				status: xhr.status,
				response: response,
			});
		});
	}
	
	/**
	 * Sends a POST request to Opera Link
	 * @param {String} method One of the following: create, delete, trash, update, or move
	 * @param {String} datatype The item type
	 *	@param {null|String} item The id of the item to modify. Use null if not applicable
	 * @param {Object} params Parameters for the request. Required parameters
	 *		depend on the method and datatype used
	 *	@param {Function(data)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.post = function(method, datatype, item, params, callback) {
		var url = opera.link.apiurl + datatype + '/' + (item || '');
		if (url[url.length - 1] != '/')
			url += '/';
		
		params = completeParams(params);
		params.api_method = method;
		
		opera.link.post(url, params, function(xhr) {
			var response = xhr.status == opera.link.response.Ok ? 
				JSON.parse(xhr.responseText || 'null') : xhr.responseText;
			callback({
				status: xhr.status,
				response: response,
			});
		});
	}
	
	/**
	 * Returns an image data URL suitable for use when creating bookmarks
	 * @param {HTMLImageElement} image The image to convert
	 * @param {Number} [size] The size of the icon (defaults to 16)
	 */
	this.makeIcon = function(image, size) {
		size = size || 16;
		
		var canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		var ctx = canvas.getContext('2d');
		ctx.drawImage(image, 0, 0, size, size);
		return canvas.toDataURL('image/png');
	}
	
	/**
	 * Returns an image data URL suitable for use when creating bookmarks
	 * Make sure to allow access to the image in config.xml or this function will
	 * fail silently without calling the callback function.
	 * @param {String} src The location of the icon
	 * @param {Function(dataurl)} callback A function which will be called with 
	 *		the result of the request. The function should is passed one argument, 
	 *		either the icon encoded as a data URL, or null if the request failed
	 */
	this.getIcon = function(src, callback) {
		var img = new Image();
		img.onload = function() {
			callback(opera.link.util.makeIcon(img));
		}
		img.onerror = function() {
			callback(null);
		}
		
		img.src = src;
	}
	
	
	/**
	 * Helper function to simplify results of requests that only return one item
	 */
	this.simplify = function(data, callback) {
		if (opera.link.simplifyResults && data.response.length == 1) 
			data.response = data.response[0];
		
		callback(data);
	}
	
	
	/**
	 * @private
	 */
	var completeParams = function(params) {
		if (!params)
			params = {};
		
		params.api_output = 'json';
		return params;
	}
}


/**
 * @namespace Accesses and/or manipulates synchronized bookmarks
 */
opera.link.bookmarks = new function OperaLinkBookmarks() {
	
	var type = 'bookmark';
	var util = opera.link.util;
	
	/**
	 * Gets a bookmark or group of bookmarks
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.get = function(item, callback) {
		util.get(type, item, null, callback);
	}
	
	/**
	 * Gets an array of all bookmarks inside a folder
	 * @param {null|String} parent The id of the parent folder or null to use the root
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.getAll = function(parent, callback) {
		var item = parent ? parent + '/descendants' : 'descendants';
		item = item.replace('//', '/');
		util.get(type, item, null, callback);
	}
	
	/**
	 * Creates a new bookmark
	 * @param {Object} params The bookmark's properties
	 * @param {null|String} parent The parent folder's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.create = function(params, parent, callback) {
		params.item_type = 'bookmark';
		util.post('create', type, parent, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Creates a new bookmark folder
	 * @param {Object} params The bookmark's properties
	 * @param {null|String} parent The parent folder's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.createFolder = function(params, parent, callback) {
		params.item_type = 'bookmark_folder';
		util.post('create', type, parent, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
	
	/**
	 * Create a new bookmark separator
	 * @param {null|String} parent The parent folder's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.createSeparator = function(parent, callback) {
		var params = {item_type: 'bookmark_separator'};
		parent = parent || null;
		util.post('create', type, parent, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Permanently deletes a bookmark, folder, or separator
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.deleteItem = function(item, callback) {
		util.post('delete', type, item, null, callback);
	}

	/**
	 * Sends a bookmark, folder, or separator to the trash
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.trash = function(item, callback) {
		util.post('trash', type, item, null, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Updates a bookmark or folder with new properties
	 * @param {String} item The item's id
	 * @param {Object} params The new properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.update = function(item, params, callback) {
		util.post('update', type, item, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
	
	/**
	 * Moves a bookmark, folder, or separator
	 * @param {String} item The item's id
	 * @param {String} ref The id of a reference item
	 * @param {String} pos The new position of the item relative to the reference item.
	 *		Use one of the following: into, after, or before
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.move = function(item, ref, pos, callback) {
		var params = {
			reference_item: ref,
			relative_position: pos
		}
		util.post('move', type, item, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
}

/**
 * @namespace Accesses and/or manipulates synchronized notes
 */
opera.link.notes = new function OperaLinkNotes() {
	
	var type = 'note';
	var util = opera.link.util;
	
	/**
	 * Gets a bookmark or group of bookmarks
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.get = function(item, callback) {
		util.get(type, item, null, callback);
	}
	
	/**
	 * Gets an array of all notes inside a folder
	 * @param {null|String} parent The id of the parent folder or null to use the root
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.getAll = function(parent, callback) {
		var item = parent ? parent + '/descendants' : 'descendants';
		item = item.replace('//', '/');
		util.get(type, item, null, callback);
	}
	
	/**
	 * Creates a new note
	 * @param {Object} params The note's properties
	 * @param {null|String} parent The parent folder's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.create = function(params, parent, callback) {
		params.item_type = 'note';
		util.post('create', type, parent, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Creates a new note folder
	 * @param {Object} params The note's properties
	 * @param {null|String} parent The parent folder's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.createFolder = function(params, parent, callback) {
		params.item_type = 'note_folder';
		util.post('create', type, parent, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
	
	/**
	 * Create a new note separator
	 * @param {null|String} parent The parent folder's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.createSeparator = function(parent, callback) {
		var params = {item_type: 'note_separator'};
		parent = parent || null;
		util.post('create', type, parent, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Permanently deletes a note, folder, or separator
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.deleteItem = function(item, callback) {
		util.post('delete', type, item, null, callback);
	}

	/**
	 * Sends a note, folder, or separator to the trash
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.trash = function(item, callback) {
		util.post('trash', type, item, null, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Updates a note or folder with new properties
	 * @param {String} item The item's id
	 * @param {Object} params The new properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.update = function(item, params, callback) {
		util.post('update', type, item, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
	
	/**
	 * Moves a note, folder, or separator
	 * @param {String} item The item's id
	 * @param {String} ref The id of a reference item
	 * @param {String} pos The new position of the item relative to the reference item.
	 *		Use one of the following: into, after, or before
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.move = function(item, ref, pos, callback) {
		var params = {
			reference_item: ref,
			relative_position: pos
		}
		util.post('move', type, item, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
}

/**
 * @namespace Accesses and/or manipulates synchronized search engines
 */
opera.link.searchengines = new function OperaLinkSearchEngines() {
	
	var type = 'search_engine';
	var util = opera.link.util;
	
	/**
	 * Gets a search engine or group of search engines
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.get = function(item, callback) {
		util.get(type, item, null, callback);
	}
	
	/**
	 * Gets an array of all search engines
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.getAll = function(callback) {
		util.get(type, 'children', null, callback);
	}
	
	/**
	 * Creates a new search engine
	 * @param {Object} params The search engine's properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.create = function(params, callback) {
		params.item_type = 'search_engine';
		util.post('create', type, null, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Permanently deletes a search engine
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.deleteItem = function(item, callback) {
		util.post('delete', type, item, null, callback);
	}

	/**
	 * Updates a search engine with new properties
	 * @param {String} item The item's id
	 * @param {Object} params The new properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.update = function(item, params, callback) {
		util.post('update', type, item, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
}

/**
 * @namespace Access and/or manipulates synchronized speed dial entries
 */
opera.link.speeddial = new function OperaLinkSpeedDial() {
	
	var type = 'speeddial';
	var util = opera.link.util;
	
	/**
	 * Gets a speed dial entry
	 * @param {Number} position The number of the speed dial
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.get = function(position, callback) {
		util.get(type, position, null, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
	
	/**
	 * Gets an array containing all speed dial entries
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.getAll = function(callback) {
		util.get(type, 'children', null, callback);
	}
	
	/**
	 * Creates a new speed dial entry
	 * @param {Object} params The speed dial entry's properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.create = function(params, callback) {
		params.item_type = 'search_engine';
		util.post('create', type, null, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Permanently deletes a speed dial entry
	 * @param {Number} position The number of the speed dial entry
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.deleteItem = function(position, callback) {
		util.post('delete', type, position, null, callback);
	}

	/**
	 * Updates a speed dial entry with new properties
	 * @param {Number} position The item's id
	 * @param {Object} params The new properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.update = function(position, params, callback) {
		util.post('update', type, position, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
}

/**
 * @namespace Access and/or manipulates synchronized URL filters
 */
opera.link.urlfilter = new function OperaLinkUrlFilter() {
	
	var type = 'urlfilter';
	var util = opera.link.util;
	
	/**
	 * Gets a url filter
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.get = function(item, callback) {
		util.get(type, item, null, callback);
	}
	
	/**
	 * Gets an array of all url filters
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.getAll = function(callback) {
		util.get(type, 'children', null, callback);
	}
	
	/**
	 * Creates a new url filter
	 * @param {Object} params The filter's properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.create = function(params, callback) {
		params.item_type = 'urlfilter';
		util.post('create', type, null, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}

	/**
	 * Permanently deletes a url filter
	 * @param {String} item The item's id
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.deleteItem = function(item, callback) {
		util.post('delete', type, item, null, callback);
	}

	/**
	 * Updates a url filter with new properties
	 * @param {String} item The item's id
	 * @param {Object} params The new properties
	 * @param {Function(result)} callback Function which is called with the result
	 *		of the request. The function is passed one argument, an object with 
	 *		two properties: "status", the response code, and "response", the JSON 
	 *		parsed response body.
	 */
	this.update = function(item, params, callback) {
		util.post('update', type, item, params, function(data) { 
			opera.link.util.simplify(data, callback);
		});
	}
}
