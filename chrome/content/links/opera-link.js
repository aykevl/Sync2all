'use strict';

// prefix: opl (OPera Link)

function OperaLink () {
	TreeBasedLink.call(this, 'opl');

	this.name = 'Opera Link'; // OBSOLETE
	this.fullName = 'Opera Link';

	// initialize opera.link
	// TODO make opera.link object-oriented
	opera.link.consumer("immqSD074yPY83JWSKAzmjUUpOcC7u40", "RmLYnd49QRcDW89rCUkPgmBuTmkTfse6");
	opera.link.loadToken();

	this.authorized = false;
	this.verifier = null; // initialize variable
}
OperaLink.prototype.__proto__ = TreeBasedLink.prototype;

var opl = new OperaLink();
webLinks.push(opl);


// fix opera.link for specific browsers
// TODO put this in Browser with generic functions
if (browser.name == 'chrome') {
	opera.link.authorizeFunction = function (url) {
		chrome.tabs.create({url: url});
	};
} else if (browser.name == 'firefox') {
	opera.link.authorizeFunction = function (url) {
		Application.activeWindow.open(IOService.newURI(url, null, null));
	};
	OperaLink.prototype.fx_display_verifierInput = function () {
		browser.popupDOM.getElementById('sync2all-opl-verifier-container').style.display = '';
	};
	OperaLink.prototype.fx_hide_verifierInput= function () {
		browser.popupDOM.getElementById('sync2all-opl-verifier-container').style.display = 'none';
	};
}
// Opera is the default in operalink.js, so no fixing required for Opera


// (re)start
OperaLink.prototype.startSync = function () {
	this.bookmarks = new BookmarkCollection(this, {});

	// initialize variables
	this.has_saved_state = false;

	// start downloading
	this.loadBookmarks();
};

OperaLink.prototype.get_state = function (state, folder) {
	// save all bookmarks in this folder
	var url;
	for (url in folder.bm) {
		// get bookmark
		var bm = folder.bm[url];

		// check whether there are bugs somewhere
		if (!bm.id || !bm.opl_id) {
			console.warn('invalid bookmark while saving state:');
			console.log(bm);
		}

		// save the state of this bookmark
		state.push({id: bm.id, opl_id: bm.opl_id});
	}

	// save all subfolders of this folder
	var title;
	for (title in folder.f) {
		// do it here and not at the start of this.get_state, because the root of
		// Opera Link has no ID.

		// get the subfolder
		var subfolder = folder.f[title];
		
		// check whether it is valid
		if (!subfolder.id || !subfolder.opl_id) {
			console.warn('invalid folder while saving state:');
			console.log(subfolder);
		}

		// save this folder
		var substate = {
				opl_id: subfolder.opl_id,
				id: subfolder.id,
				children: [], // folders should always have children
			};
		state.push(substate);

		// recurse into subfolders
		this.get_state(substate.children, subfolder);
	}
}

OperaLink.prototype.mapLinkIdsToLocalIds = function (state) {
	var item;
	for (var i=0; item=state[i]; i++) {
		this.ownId_to_lId[item.opl_id] = item.id;
		if (this.bookmarks.ids[item.opl_id])
			this.bookmarks.ids[item.opl_id].id = item.id;

		// if this node has children (that means this is a folder).
		if (item.children) {
			this.mapLinkIdsToLocalIds(item.children);
		}
	}
}

// @var parentNode The current folder (represents #state), undefined if this folder
// is deleted (and should be checked for moved items).
// @var state The array of children of this folder.
OperaLink.prototype.calculate_actions = function (parentState, parentNode) {
	var item;

	/* check for removed and moved items */

	for (var i=0; item=parentState[i]; i++) {
		if (!item.opl_id || !item.id) {
			console.error('saved item has no id or opl_id (bug somewhere else!); item, parentNode:');
			console.error(item);
			console.error(parentNode);
			continue;
		}

		var isfolder = false; // whether this item is a folder

		// folders have always children (unlike Opera Link);
		if (item.children) {
			isfolder = true
		}

		if (!parentNode) {
			// this folder has been deleted, check for items that have been
			// moved outside this folder. Not really needed, but it is better
			// to move folders and bookmarks than to re-create them. (Preserves
			// more data, for example descriptions and favicons).
			if (this.bookmarks.ids[item.opl_id]) {
				// this node does still exist but in another place, mark it as moved.
				if (sync2all.bookmarks.ids[item.id])
					 this.bookmarks.moved[item.id] = true;

				/*var node = this.bookmarks.ids[item.opl_id];

				// get the destination (local) folder, the parent of otherNode
				var localParentNodeId = this.ownId_to_lId[node.parentNode.opl_id];
				if (sync2all.bookmarks.ids[localParentNodeId]) {
					var localParentNode = sync2all.bookmarks.ids[localParentNodeId];
				} else {
					var localParentNode = null;
				}

				if (node.url) { // if this is a bookmark
					// check whether this bookmark has already been moved
					// If not, add an action
					if (localParentNode && !localParentNode.bm[node.url]) {
						this.bookmarks.moved[item.id] = true;
					}
				} else {
					// check whether this folder has already been moved local
					if (localParentNode && !localParentNode.f[node.title]) {
						this.bookmarks.moved[item.id] = true;
					}
				}*/
			} else {
				// node doesn't exist, remove it.
				if (isfolder) {
					this.calculate_actions(item.children, undefined);
					if (item.id && sync2all.bookmarks.ids[item.id]) {
						sync2all.bookmarks.ids[item.id].opl_id = item.opl_id;
						this.bookmarks.deleted[item.id] = true;
					}
				} else {
					// check whether the bookmark still exists
					if (sync2all.bookmarks.ids[item.id]) {
						sync2all.bookmarks.ids[item.id].opl_id = item.opl_id;
						this.bookmarks.deleted[item.id] = true;
					}
				}
			}
		} else {
			// this folder does exist (is most often the case).
			if (!this.bookmarks.ids[item.opl_id]){
				if (isfolder) {

					// first check for folders and bookmarks moved out of this
					// folder.
					this.calculate_actions(item.children, undefined);

					// then remove this folder
					// but check first whether the folder actually exists
					if (item.id && sync2all.bookmarks.ids[item.id]) {
						sync2all.bookmarks.ids[item.id].opl_id = item.opl_id;
						console.log('opl: old f: '+sync2all.bookmarks.ids[item.id].title);
						this.bookmarks.deleted[item.id] = true;
					}
				} else {
					// check whether the bookmark still exists.
					if (sync2all.bookmarks.ids[item.id]) {
						console.log('opl: old bm: '+item.opl_id);
						sync2all.bookmarks.ids[item.id].opl_id = item.opl_id;
						this.bookmarks.deleted[item.id] = true;
					}
				}

			} else if (this.bookmarks.ids[item.opl_id].parentNode != parentNode &&
					sync2all.bookmarks.ids[item.id].parentNode.id != this.bookmarks.ids[item.opl_id].parentNode.id) {
				var movedTo = this.bookmarks.ids[item.opl_id].parentNode;

				// useful information for debugging
				console.log('opl: moved: ', item, movedTo);

				// mark as moved, merge will handle the rest
				this.bookmarks.moved[item.id] = true;

				if (isfolder) {
					// search for changes within this folder
					this.calculate_actions(item.children, this.bookmarks.ids[item.opl_id]);
				}

			} else {
				// nothing has happened, search recursively for changes.
				if (isfolder) {
					this.calculate_actions(item.children, this.bookmarks.ids[item.opl_id]);
				}
			}
		}
	}
}

OperaLink.prototype.msg_verifier = function (request) {

	if (this.authorized) return; // strange, shouldn't happen
	if (this.verifier == request.verifier) return;  // shouldn't happen too, but it happens (???)

	// log status
	console.log('Got verifier code: '+request.verifier);


	this.verifier = request.verifier;
	if (!this.verifier) { // check for validity
		this.status = statuses.READY;
		this.stop();
		return;
	}


	// use verifier
	opera.link.getAccessToken(this.requestToken, this.requestTokenSecret,
			this.verifier, this.accessTokenCallback.bind(this), this.accessTokenError.bind(this));
};

OperaLink.prototype.accessTokenCallback = function (e) {
	// save the token to localStorage
	opera.link.saveToken();

	// mark this link as being authorized
	this.authorized = true;

	// start loading the bookmarks
	this.loadBookmarks();
};

OperaLink.prototype.accessTokenError = function (e) {
	// report the error
	console.log('error getting access token:');
	console.log(e);
	alert('There was an error while connecting to Opera Link. See the log for details.');
};

OperaLink.prototype.onUpdateStatus = function (statusChanged) {
	if (browser.name == 'firefox') {
		if (sync2all.browser.isPopupOpen) {
			// status will also be updated when the popup opens, so this function
			// is always called.
			if (this.status == statuses.AUTHORIZING) {
				this.fx_display_verifierInput();
			} else {
				this.fx_hide_verifierInput();
			}
		}
	}
}


// Callback for when the request tokens have been got.
OperaLink.prototype.requestTokenCallback = function (e) {

	// log status
	console.log('Got request token, asking user to authorize...');

	// save temporary tokens tokens
	this.requestToken = e.token;
	this.requestTokenSecret = e.secret;

	// listen to the verifier from the content script
	if (browser.name == 'chrome') {
	} else if (browser.name == 'opera') {
		opera.extension.broadcastMessage({action: 'opl-verifierInput-on'});
	}
};


OperaLink.prototype.requestTokenError = function (e) {
	// report error
	console.error('error getting request token:');
	console.log(e);
	console.log('Old tokens have been removed, so you might want to try again.');
	alert('There was an error while connecting to Opera Link. See the log for details.\n\nOpera Link is now disabled.');
	
	// remove possibly bad tokens
	delete localStorage.oauth_token;
	delete localStorage.oauth_secret;

	// clear the in-memory tokens inside the Opera Link library
	opera.link.deauthorize();

	// disable Opera Link
	this.updateStatus(statuses.READY);
	this.stop();
};

OperaLink.prototype.loadBookmarks = function () {
	this.updateStatus(statuses.DOWNLOADING);
	opera.link.bookmarks.getAll(this.bookmarksLoaded.bind(this));
};

OperaLink.prototype.bookmarksLoaded = function (result) {
	if (result.status == 401) { // unauthorized
		// authorize now
		opera.link.deauthorize();
		this.updateStatus(statuses.AUTHORIZING);
		opera.link.requestToken(this.requestTokenCallback.bind(this), this.requestTokenError.bind(this));
		return;
	}
	if (result.status >= 400 || result.status < 100) {
		// other error

		alert('There is a problem with Opera Link. Opera Link is now disabled. See the log for details.');

		// here is the log
		console.log('result of bookmarksLoaded:');
		console.log(result);

		// stop syncing the next time
		this.stop();

		// don't parse, will lead to errors:
		return; // BUGFIX: would otherwise remove all bookmarks!!!
	}

	// check whether there is an error
	if (!result.response.length) {
		// log useful information
		console.log('result of bookmarksLoaded:');
		console.log(result);

		// confirm whether the user wants to remove all bookmarks
		if (!confirm('Are you sure you want to remove all bookmarks?'+
				'\nWhen you haven\'t removed all bookmarks this is a bug.')) {
			console.log('doesn\'t want to remove all bookmarks');
			this.stop();
			return;
		} else {
			// yes, (s)he wants to (!?!)
		}
	}

	// there is no problem with Opera Link

	// updat the status in the popup
	this.updateStatus(statuses.PARSING);

	// parse the bookmarks
	this.parseBookmarks(result.response, this.bookmarks);

	// send signal to sync engine to start merging
	this.startingFinished();
};

OperaLink.prototype.parseBookmarks = function (array, folder) {
	var item;
	for (var i=0; item=array[i]; i++) {
		if (item.item_type == 'bookmark_folder') {
			// is this the trash?
			if (item.properties.type && item.properties.type == 'trash') {
				// yes, ignore the folder
				continue; // don't sync trashed bookmarks
			}

			var subfolder = folder.importFolder({title: item.properties.title,
					id: item.id});

			if (item.children) {
				this.parseBookmarks(item.children, subfolder);
			}
		} else if (item.item_type == 'bookmark') {
			folder.importBookmark({url: item.properties.uri,
					title: item.properties.title, id: item.id});
		}
	}
};

OperaLink.prototype.fixBookmark = function (bm) {
	if (!bm.title) {
		// fix title. Opera Link needs a title
		bm.setTitle(bm.url);
	}
}

OperaLink.prototype.removeItem = function (node, callback) {
	opera.link.bookmarks.deleteItem(node.getId(this), callback);
}

OperaLink.prototype.changeItem = function (node, callback) {
	// TODO calculate changes somewhere else
	// TODO only change those that really have changed
	if (node instanceof BookmarkFolder) {
		var changes = {title: node.title};
	} else if (node instanceof Bookmark) {
		var changes = {title: node.title, uri: node.url};
	} else {
		console.error(node);
	}
	opera.link.bookmarks.update(node.opl_id, changes, callback);
}

OperaLink.prototype.moveItem = function (node, callback) {
	opera.link.bookmarks.move(node.opl_id, node.parentNode.opl_id || '', 'into', callback);
}

OperaLink.prototype.createItem = function (node, callback) {
	// TODO: last visited timestamp, comments (from Google Bookmarks)
	
	function ownCallback (result) {
		node.opl_id = result.response.id;
		callback(result);
	}

	if (node instanceof Bookmark) {
		this.fixBookmark(node);
		var oplData = {title: node.title, uri: node.url};
		if (node.parentNode == sync2all.bookmarks) {
			opera.link.bookmarks.create(oplData, ownCallback.bind(this)); //, created: timestamp(new Date(node.mtime))
		} else {
			opera.link.bookmarks.create(oplData, node.parentNode.opl_id, ownCallback.bind(this)); //, created: timestamp(new Date(node.mtime))
		}
	} else if (node instanceof BookmarkFolder) {
		var oplData = {title: node.title};
		// createFolder(params, [parent,] callback);
		if (node.parentNode.opl_id) {
			opera.link.bookmarks.createFolder(oplData, node.parentNode.opl_id, ownCallback.bind(this));
		} else {
			opera.link.bookmarks.createFolder(oplData, ownCallback.bind(this));
		}
	} else {
		console.error(node);
		throw 'unknown node';
	}
}


