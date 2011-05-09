
var verifier = document.getElementById('verifier').firstChild.nodeValue;

// TODO send verifier to extension

if (verifier) {
	chrome.extension.sendRequest({action: "opl_verifier", verifier: verifier}, function(response) {});
	alert('Got request token. You may close this page.');
} else {
	alert('No verifier found on this page!\n\nContact the developer of this extension about this error.');
}
