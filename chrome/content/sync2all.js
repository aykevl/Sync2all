'use strict';

/* = Nodes =

   == Bookmark node: ==
   {
	title:      // title of the bookmark
	id:         // local browser ID
	mtime:      // integer, timestamp in seconds (may be floating point number). Not always present.
	parentNode: // it's parent folder
	url:        // self-explanatory (identifies it as a bookmark too)
	*_id:       // link-specific IDs
   }

   == Folder node: ==
   {
	title: ..., // title of folder
	id          // Local (Chrome/Firefox) node id
	bm: {...}   // dictionary of bookmark nodes (key = url)
	f: {...}    // dictionary of folder   nodes (key = title)
	parentNode  // It's parent. Doesn't exist for the root.
	mtime:      // like bookmark.mtime
	*_id:       // link-specific IDs (only when they are folder-based)
   }
*/

function Sync2all() {

	this.bookmarks = null;
	this.messageListeners = [browser];

	// webLinks doesn't include browser links (obvious)
	this.syncedWebLinks = [];
}


	// Start synchronisation. This starts all other things, like Google Bookmarks and Opera Link
Sync2all.prototype = {

	run: function () {
		this.browser = browser;
		browser.loadBookmarks(function (bookmarks) {
				this.bookmarks   = bookmarks;

				// check for consistency
				if (debug) browser.selftest();

				// start all other links
				var webLink;
				for (var i=0; webLink=webLinks[i]; i++) {
					webLink.load();
				}
			}.bind(this));
		browser.startObserver();
	},

	onPopupCreation: function (_popupDOM) {
		this.browser.isPopupOpen = true;

		if (browser.name == 'firefox') {
			browser.popupDOM = _popupDOM;
		}

		// Opera support deprecated (till they support bookmarks editing from
		// extension), so is not needed.
		/*if (browser.name == 'opera' && opl.status == statuses.AUTHORIZING) {
			// display input
			opera.extension.broadcastMessage({action: 'opl-verifierInput-on'});
		}*/

		var link;
		for (var i=0; link=webLinks[i]; i++) {
			link.updateStatus();
		}
	},

	onPopupClosing: function () {
		this.browser.isPopupOpen = false;

		if (browser.name == 'firefox') {
			// save resources (may leak the whole window!)
			delete browser.popupDOM;
		}
	},

	commit: function () {
		broadcastMessage('commit', null);
	},

	onLinkFinished: function (link) {

		if (debug) {
			if (link.selftest) {
				link.selftest();
			}
			// FIXME not very nice here
			tagtree.selftest();
		}

		// check for possible bugs
		if (link.actions && link.actions.length > 10) {
			if (!confirm('There have been many changes in '+link.name+' ('+
					link.actions.length+' deletes/moves). '+
					'Are you sure you want to apply them?\n\n'+
					'This might be a bug in this extension.')) {
				link.stop(); // removes status information too
				return;
			}
		}

		// apply actions
		if (link.actions) {
			var action;
			for (var i=0; action=link.actions[i]; i++) {
				apply_action(link, action);
			}
		}

		// set status to merging the tree
		link.updateStatus(statuses.MERGING);

		// merge the bookmarks
		console.log('Merging bookmarks with '+link.fullName+'...');
		this.bookmarks.mergeWith(link.bookmarks);
		// are not needed anymore, and should not be used. They use a lof memory too.
		if (!debug) {
			delete link.bookmarks;
			delete link.ids;
		}
		console.log('Finished merging with '+link.fullName+'.');

		// set status (again)
		link.updateStatus(statuses.READY);

		/*if (!link.has_saved_state && this.startingLinksAfterInit) { // if this is the first time the link starts (not a resynchronisation)
			this.startingLinksAfterInit -= 1;
		}*/

		var startingWebLinks = 0;
		var webLink;
		for (var i=0; webLink=webLinks[i]; i++) {
			if (webLink.status && webLink.status < statuses.MERGING) {
				startingWebLinks += 1;
			}
		}

		// is the syncing finished? Commit changes!
		if (!startingWebLinks) {
			this.commit();
			console.log('All weblinks ready');
		}
	},
}


/* Call all links except #sourceLink and links that have declared they want
 * all notifications
 * @string methodName The function to call
 * @object sourceLink The calling link, function will not be called upon it
 * except if a flag is set to receive all notifications.
 * @object params The parameters for the function (sourceLink is inserted at
 * the start)
 */
function broadcastMessage(methodName, sourceLink, params) {
	if (!sourceLink && sourceLink != null) {
		console.error('BUG: link is not defined, in broadcastMessage()');
	}

	// first parameter should be the link
	if (params) params.unshift(sourceLink); // add link at the start

	var link;
	for (var i=0; link=sync2all.messageListeners[i]; i++) {
		// ignore the calling link, except when a flag is set.
		if (link == sourceLink && !sourceLink.has_own_data) continue;

		var method = link[methodName];
		if (method == false) {
			// marked as not available.
			// ignore
		} else if (method == undefined) {
			// this method is not implemented. Give a warning indicating so.
			console.warn('WARNING: '+link.name+' hasn\'t implemented '+methodName+' (set function to false to ignore)');
			link[methodName] = false; // prevent future logs causing lots of data
		} else {
			if (params) {
				link[methodName].apply(link, params);
			} else {
				link[methodName].apply(link);
			}
		}
	}
}

// apply action, parts are the same as broadcastMessage.
function apply_action (link, action) {
	// first get the arguments
	var args    = [];
	var arg;
	// start after the first arg, that is the function name.
	for (var i_arg=1; arg=action[i_arg]; i_arg++) {
		if (typeof(arg) == 'object' && arg.length) {
			arg = get_stable_lId(link, arg);
		} else {
			arg = sync2all.bookmarks.ids[arg];
		}
		if (!arg) {
			console.warn('WARNING: action could not be applied (link: '+link.name+'):');
			console.log(action);
			return; // WARNING: errors may not be catched!
		}
		args.push(arg);
	}
	
	// then get the command
	var command = action[0];

	// and check whether it is allowed
	if (command == 'f_del_ifempty') {
		// directory shouldn't be removed if it has entries in it
		if (args[0].hasContents()) return;
		command = 'f_del';
	}

	// apply actions partially
	if (command == 'f_del') {
		args[0].remove(link);
	} else {
		console.log('ERROR: unknown action: ');
		console.log(action);
		return;
	}
}

function get_stable_lId(link, sid) {
	// speed up. This will happen most of the time.
	if (sync2all.bookmarks.ids[sid[0][0]]) {
		return sync2all.bookmarks.ids[sid[0][0]];
	}

	// determine the first known node
	var i=0;
	while (true) {
		// the first sid[i][0] will be '1', so it isn't needed to check
		// whether i goes too far.
		if (sync2all.bookmarks.ids[sid[i][0]]) {
			break;
		}
		i += 1;
	}

	// make all remaining folders
	var node = sync2all.bookmarks.ids[sid[i][0]];
	while ( i>0 ) {
		i -= 1;
		// assume this is a directory
		// check whether this folder already exsists
		if (node.f[sid[i][1]]) {
			node = node.f[sid[i][1]];
		} else {
			var folder = node.newFolder(link, {bm: {}, f: {}, parentNode: node, title: sid[i][1]});
			node = folder;
		}
	}
	return node;
}

sync2all = new Sync2all();

