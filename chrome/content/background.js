
var current_browser;
var remotes;
var links = [gbm, opl];
if (browser.name == 'chrome') {
	current_browser = gchr; // currently only supports Google Chrome
	remotes = [gbm, opl];
	links.push(gchr);
} else if (browser.name == 'firefox') {
	current_browser = fx;
	remotes = [gbm, opl];
	links.push(fx);
} else if (browser.name == 'opera') {
	current_browser = opl;
	remotes = [gbm];

	// opl is already in links
}
var remotes_enabled = [];
var remotes_finished;

var g_bookmarks; // global bookmarks
var g_bookmark_ids;


/* = Nodes =

   == Bookmark ==
   dictionary: {
	title:      // title of the bookmark
	id:         // local id
	timestamp:  // integer, timestamp
	parentNode: // it's parent folder
	url:        // self-explanatory (identifies it as a bookmark too)
   }

   == Folder ==
   dictionary: {
	title: ..., // title of folder
	id          // Local (Chrome) node id
	bm: {...}   // dictionary of bookmark nodes (key = url)
	f: {...}    // dictionary of folder   nodes (key = title)
	parentNode  // It's parent. Doesn't exist for the root.
   }
*/

var lastSync      = 0; //localStorage['lastSync'];

/*var synced = false;      // when in sync, this is true
var syncing = false;     // if doing some work locally (or when syncing full)
var downloading = false; // if downloading bookmarks*/

// these functions are called when the popup is created or closed

function popupCreated(window, document) {
	is_popup_open = true;

	if (browser.name == 'firefox') {
		// needed for opening a new tab
		current_window = window;
		current_document = document;
	}

	if (browser.name == 'opera' && opl.status == statuses.AUTHORIZING) {
		// display input
		opera.extension.broadcastMessage({action: 'opl-verifierInput-on'});
	}

	var link;
	for (var i=0; link=links[i]; i++) {
		if (!link.updateStatus) continue;
		link.updateStatus();
	}}

function popupClosed() {
	is_popup_open = false;

	if (browser.name == 'firefox') {
		// save resources (may leak the whole window!)
		delete current_window;
		delete current_document;
	}

}


function onLoad() {
	initSync();
}

function call_all(funcname, link, params) {
	// link should be defined
	if (!link && link != null) {
		console.error('BUG: link is not defined in call_all()');
	}

	// first parameter should be the link
	if (params) params.unshift(link); // add link at the start

	var remote;
	for (var i=0; remote=remotes_finished[i]; i++) {
		// if this is the link where the call comes from
		// Report changes when the link is syncing, it needs to know that
		if (remote == link && !link.has_own_data) continue;

		func = remote[funcname];
		if (func == false) continue; // marked as not available;
		if (func == undefined) {
			console.warn('WARNING: '+remote.name+' hasn\'t implemented '+funcname+' (set to false to ignore)');
			remote[funcname] = false; // prevent future logs causing lots of data
			continue;
		}

		try {
			var self = remote;
			if (params) {
				self[funcname].apply(this, params);
			} else {
				self[funcname].apply(this);
			}
		} catch (error) {
			console.log('call_all: ERROR: in function '+funcname+' applied to link '+remote.name+':');
			console.error(error);
			console.trace();
		}
	}
}

function commit() {
	// when update_batch is true, a batch of updates is in progress.
	// It is better when we wait till that has finished before we commit
	// everyting (for example, Google Bookmarks is efficienter in that case).
	// When the batch has been finished, commit() will be called again.
	if (update_batch) return;
	call_all('commit', null);
}

// Bookmark-tree modifying:
// The functions prefixed with _ don't report it to other links.

function addNode(source, node, parentNode) {
	if (!parentNode) {
		throw 'undefined parentNode';
	}
	node.parentNode = parentNode;
	if (node.url) {
		addBookmark(source, node);
	} else {
		addFolder(source, node);
	}
}
function addBookmark(source, bm) {
	if (!bm.parentNode) {
		console.log(bm);
		throw 'Undefined parentNode';
	}
	bm.parentNode.bm[bm.url] = bm;
	call_all('bm_add', source, [bm]);
}
function addFolder(source, folder) {
	folder.parentNode.f[folder.title] = folder;
	call_all('f_add', source, [folder]);
}

function rmNode(source, node) {
	if (node.url) {
		rmBookmark(source, node);
	} else {
		rmFolder(source, node);
	}
}

function rmBookmark(link, bookmark) { // public function
	_rmBookmark(bookmark);
	console.log('Removed bookmark: '+bookmark.url);
	call_all('bm_del', link, [bookmark]);
}
function _rmBookmark(bookmark) { // internal use only
	if (!bookmark.parentNode) {
		console.log(bookmark);
		throw 'Undefined parentNode';
	}
	delete bookmark.parentNode.bm[bookmark.url];
}

function rmFolder(source, folder) {
	_rmFolder(folder);
	call_all('f_del', source, [folder]);
}
function _rmFolder(folder) {
	delete folder.parentNode.f[folder.title];
}

function mvBookmark (link, bm, target) {
	_mvBookmark(bm, target);
	call_all('bm_mv', link, [bm, target]);
}

function mvNode(link, node, target) {
	_mvNode(node, target);
	if (node.url) {
		call_all('bm_mv', link, [node, target]);
	} else {
		call_all('f_mv', link, [node, target]);
	}
}

function _mvNode(node, target) {
	if (node.parentNode == target) {
		console.warn('WARNING: node moved to it\'s parent folder! node:');
		console.log(node);
		console.trace();
		return; // nothing to do here
	}
	if (!target) {
		throw 'undefined target';
	}
	if (node.url) {
		_mvBookmark(node, target);
	} else {
		_mvFolder(node, target);
	}
}
function _mvBookmark(bm, target) {
	delete bm.parentNode.bm[bm.url];
	bm.parentNode = target;
	// FIXME check for duplicate
	target.bm[bm.url] = bm;
}
function _mvFolder(folder, target) {
	if (!folder.parentNode) {
		console.log(folder);
		throw 'Undefined parentNode';
	}
	delete folder.parentNode.f[folder.title];
	folder.parentNode = target;
	// FIXME check for duplicate
	target.f[folder.title] = folder;
}

// whether this folder-node has contents (bookmarks or folders)
function has_contents(folder) {
	for (url in folder.bm) {
		return true;
	}
	for (title in folder.f) {
		return true;
	}
}


// dump all important variables
// Only useful for debugging.
function dump_all() {
	console.log('--------------------------------------------------');
	console.log('root:');
	console.log(root);
	console.log('--------------------------------------------------');
}

// Start synchronisation. This starts all other things, like Google Bookmarks or Opera Link
function initSync () {

	remotes_finished = [];

	startSync = 0; // will be updated when targets are synchronized

	// initialize when needed
	if (current_browser.init) {
		current_browser.init();
	}

	// and start the browser link
	current_browser.enable();
}

function target_finished(link) {

	// check for possible bugs
	if (link.actions && link.actions.length > 10) {
		if (!confirm('There have been many changes in '+link.name+' ('+
				link.actions.length+' deletes/moves). '+
				'Are you sure you want to apply them?\n\n'+
				'This might be a bug in this extension.')) {
			link.disable(); // removes status information too
			return;
		}
	}

	remotes_finished.push(link);

	// update internal data to use objects from g_bookmarks and not
	// from it's own data.
	if (link.update_data) {
		link.update_data();
	}

	// apply actions
	if (link.actions) {
		var action;
		for (var i=0; action=link.actions[i]; i++) {

			apply_action(link, action);
		}
	}

	// merge bookmarks etc.
	merge(link);

	// is this the browser itself? start the rest!
	if (link == current_browser) {
		g_bookmark_ids = current_browser.ids;
		var remote;
		for (var i=0; remote=remotes[i]; i++) {
			remote.init();
		}
	} else {
		// this is a real target link
	}

	// is the syncing finished? Commit changes!
	if (remotes_enabled.length+1 == remotes_finished.length) { // current_browser isn't in remotes_enabled, but is in remotes_finished. The +1 is to correct this.
		commit();
		call_all('finished_sync', null);
	}
}

// Wrapper for call_all, for applying actions.
function apply_action (link, action) {
	// first get the arguments
	var args    = [];
	var arg;
	// start after the first arg, that is the function name.
	for (var i_arg=1; arg=action[i_arg]; i_arg++) {
		if (typeof(arg) == 'object' && arg.length) {
			arg = get_stable_lId(link, arg);
		} else {
			arg = current_browser.ids[arg];
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
		if (has_contents(args[0])) return;
		command = 'f_del';
	}

	// apply actions partially
	if (command == 'bm_mv' || command == 'f_mv') {
		// do the action here
		mvNode(link, args[0], args[1]);
	} else if (command == 'bm_del') {
		rmBookmark(link, args[0]);
	} else if (command == 'f_del') {
		rmFolder(link, args[0]);
	} else {
		console.log('ERROR: unknown action: ');
		console.log(action);
		return;
	}
	//call_all(command, link, args);
}

function get_stable_lId(link, sid) {
	// speed up. This will happen most of the time.
	if (current_browser.ids[sid[0][0]]) {
		return current_browser.ids[sid[0][0]];
	}

	// determine the first known node
	var i=0;
	while (true) {
		// the first sid[i][0] will be '1', so it isn't needed to check
		// whether i goes too far.
		if (current_browser.ids[sid[i][0]]) {
			break;
		}
		i += 1;
	}

	// make all remaining folders
	var node = current_browser.ids[sid[i][0]];
	while ( i>0 ) {
		i -= 1;
		// assume this is a directory
		// check whether this folder already exsists
		if (node.f[sid[i][1]]) {
			node = node.f[sid[i][1]];
		} else {
			var folder = {bm: {}, f: {}, parentNode: node, title: sid[i][1]};
			addFolder(link, folder);
			node = folder;
		}
	}
	return node;
}

function merge (link) {
	
	if (!g_bookmarks) {
		console.log('Taking '+link.name+' as base of the bookmarks.');
		g_bookmarks = link.bookmarks;
	} else {
		console.log('Merging bookmarks with '+link.name+'...');
		mergeBookmarks(g_bookmarks, link.bookmarks, link);
		console.log('Finished merging with '+link.name+'.');
	}
};

function mergeProperties(from, to) {
	for (key in from) {
		if (key == 'bm' || key == 'f' || key == 'parentNode') continue;
		if (to[key] === undefined) {
			to[key] = from[key];
		}
	}
};

// 'local' represents 'remote'.
// 'target' is the source of 'remote' ($remote might represent $target.bookmarks)
function mergeBookmarks(local, remote, target) {

	// merge properties
	mergeProperties(remote, local);

	// unique local folders
	for (title in local.f) {
		var local_subfolder = local.f[title];

		// sub-label
		if (!(title in remote.f)) {
			// unique folder/label
			console.log('Unique local folder: '+title);
			syncLFolder(target, local_subfolder);

		} else {
			// other folder does exist, merge it too

			var remote_subfolder = remote.f[title];

			mergeBookmarks(local_subfolder, remote_subfolder, target);
		}
	}

	// find unique remote bookmarks
	for (url in remote.bm) {
		var bookmark = remote.bm[url];
		
		// ignore empty bookmarks
		if (!bookmark.title || !bookmark.url) continue;

		if (!(url in local.bm)) {
			// unique remote bookmark

			// log this
			console.log('Unique remote bookmark: '+bookmark.url);
			console.log(bookmark);

			// copy bookmark
			syncRBookmark(target, bookmark, local);
		} else {
			mergeProperties(bookmark, local.bm[url]);
		}
	}

	// resolve unique local bookmarks
	for (url in local.bm) {
		var bm = local.bm[url];
		if (!(url in remote.bm)) {
			// unique local bookmark
			console.log('Unique local bookmark: '+bm.url);
			syncLBookmark(target, bm);
		} else {

			// TODO merge changes (changed title etc.)
			// bookmark exists on both sides
			/*// bookmark exists at remote
			var bookmark = parentNode.bm[url];
			local_ids[bm.id] = bookmark;
			// FIXME check for duplicate (local) URLs (in the same folder)
			bookmark.id = bm.id;
			if (bm.title != bookmark.title) {
				// title changed, set local title to remote title
				console.log('Title of bookmark changed: '+bm.url);

				// changing this doesn't hurt (will be tracked, will not recurse)
				chrome.bookmarks.update(bookmark.id, {title: bookmark.title});
			}*/
		}
	}

	// find unique remote folders (for example, Google Bookmarks)
	for (title in remote.f) {
		var rsubfolder = remote.f[title];

		// ignore bogus folders
		if (!rsubfolder.title || !rsubfolder.bm || !rsubfolder.f)
			continue;

		if (!(title in local.f)) {
			// unique remote folder
			console.log('Unique remote folder:');
			console.log(rsubfolder);
			syncRFolder(target, rsubfolder, local);
		}
	}
}

// folder is (not yet) in the local bookmarks
// lparentfolder represents rfolder.parentNode
function syncRFolder(target, rfolder, lparentfolder) {
	var bookmark_count = 0;

	// TODO create (tmp?) folder
	var lfolder = {bm: {}, f: {}, title: rfolder.title, parentNode: lparentfolder};
	mergeProperties(rfolder, lfolder); // copy opl_id etc
	lparentfolder.f[lfolder.title] = lfolder;
	call_all('f_add', target, [lfolder]);

	// sync bookmarks
	for (url in rfolder.bm) {
		var rbookmark = rfolder.bm[url];
		bookmark_count += syncRBookmark(target, rbookmark, lfolder);
	}

	// sync folders/labels
	for (title in rfolder.f) {
		var subrfolder = rfolder.f[title];
		console.log(subrfolder);
		bookmark_count += syncRFolder(target, subrfolder, lfolder); // recursion
	}

	// if there aren't any bookmarks in this folder (and thus also no folders)
	/*if (bookmark_count == 0) {
		target.f_del(undefined, rfolder);
		delete rfolder.parentNode.f[rfolder.title];
		delete lfolder.parentNode.f[lfolder.title];
		console.log('Removed empty folder: '+rfolder.title);
	}*/

	// for recursion
	return bookmark_count;
}

// folder exists only locally
function syncLFolder(target, folder) {
	var bookmark_count = 0;

	if (target.f_add !== false) target.f_add(undefined, folder);

	// sync folders
	var subfolder;
	for (title in folder.f) {
		subfolder = folder.f[title];
		bookmark_count += syncLFolder(target, subfolder);
	}

	// sync bookmarks
	var bm;
	for (url in folder.bm) {
		bm = folder.bm[url];
		bookmark_count += syncLBookmark(target, bm);
	}

	// remove folder if empty
	if (bookmark_count == 0) {
		// TODO, check whether this works
		// Google Bookmarks should do this, that's why it is commented out.
		//delLFolder(target, folder);
	}
	return bookmark_count;
}

// bookmark exists only on remote (for example, on Google Bookmarks)
function syncRBookmark(target, bookmark, lfolder) {
	// sync single bookmark
	// if the bookmark is new and this isn't the first sync
	if (bookmark.time < target.lastSync && lastSync != 0) {
		// this bookmark is really old
		return delRBookmark(target, bookmark, lfolder);
	} else {
		return pushRBookmark(target, bookmark, lfolder);
	}
}
function delRBookmark(target, bookmark, lfolder) {
	console.log('Old remote bookmark :'+bookmark.url);
	call_all('bm_del', target, [bookmark]);
	// bookmark doesn't exist locally, so no removing required
	return 0;
}
function pushRBookmark(link, bookmark, lfolder) {
	console.log('New remote bookmark: '+bookmark.url);
	bookmark.parentNode = lfolder;
	addBookmark(link, bookmark);
	return 1;
}

// bookmark exists only locally
function syncLBookmark(target, bookmark) {
	if (lastSync == 0 || bookmark.timestamp > lastSync) { // initial sync or really new bookmark
		return pushLBookmark(target, bookmark);
	} else {
		return delLBookmark(target, bookmark);
	}
}
function pushLBookmark(target, bm) {
	console.log('New local bookmark: '+bm.url);
	target.bm_add(undefined, bm);
	return 1;
}
function delLBookmark(target, bm) {
	// remove bookmark
	console.log('Old local bookmark: '+bm.url);
	// TODO
	//call_all('bm_del', target, [bm]);
	return 0;
}


