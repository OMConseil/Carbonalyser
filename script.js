extractHostname = (url) => {
  let hostname = url.indexOf("//") > -1 ? url.split('/')[2] : url.split('/')[0];

  // find & remove port number
  hostname = hostname.split(':')[0];
  // find & remove "?"
  hostname = hostname.split('?')[0];

  return hostname;
};


checkWhitelist = (origin) => {

  const whitelistState = localStorage.getItem('whitelistState');
  var storedWhitlist = localStorage.getItem('whitelist');
  whitelist = null === storedWhitlist ? {} : JSON.parse(storedWhitlist);


  if (whitelistState == 'ON') {
    for (var website in whitelist) {
      if (origin !== undefined && origin.toString().includes(website)) {
        return true;
      }
    }
    return false;
  }

  return true;

}

readFile = function (file) {
  var reader = new FileReader();
  reader.onload = function () {
     var csvContent = reader.result.split("\r\n");
     for (var i = 0; i < csvContent.length-1; i++){
      addWebsiteToWhitelist(csvContent[i]);
     }
     
  };
  
  reader.readAsBinaryString(file);
};

addWebsiteToWhitelist = (website) => {
  var whitelist = getWhitelist();
  whitelist[website] = "1";
  localStorage.setItem('whitelist', JSON.stringify(whitelist));
}

getWhitelist = () => {
  const whitelist = localStorage.getItem('whitelist');
  return null === whitelist ? {} : JSON.parse(whitelist);
}

setByteLengthPerOrigin = (origin, byteLength) => {
  if (checkWhitelist(origin)) {
    const stats = localStorage.getItem('stats');
    const statsJson = null === stats ? {} : JSON.parse(stats);

    let bytePerOrigin = undefined === statsJson[origin] ? 0 : parseInt(statsJson[origin][0]);
    let timePerOrigin = undefined === statsJson[origin] ? 0 : parseInt(statsJson[origin][1]);
    statsJson[origin] = [bytePerOrigin + byteLength, timePerOrigin];

    localStorage.setItem('stats', JSON.stringify(statsJson));
  }
};

setTimePerOrigin = () => {
  if (checkWhitelist(currentTab)) {
    const stats = localStorage.getItem('stats');
    const statsJson = null === stats ? {} : JSON.parse(stats);
    

    let bytePerOrigin = undefined === statsJson[currentTab] ? 0 : parseInt(statsJson[currentTab][0]);
    let timePerOrigin = undefined === statsJson[currentTab] ? 0 : statsJson[currentTab][1];
    statsJson[currentTab] = [bytePerOrigin, timePerOrigin + 1];
    localStorage.setItem('stats', JSON.stringify(statsJson));
  }
};

isChrome = () => {
  return (typeof (browser) === 'undefined');
};

headersReceivedListener = (requestDetails) => {

  if (isChrome()) {
    const origin = extractHostname(!requestDetails.initiator ? requestDetails.url : requestDetails.initiator);
    const responseHeadersContentLength = requestDetails.responseHeaders.find(element => element.name.toLowerCase() === "content-length");
    const contentLength = undefined === responseHeadersContentLength ? {
        value: 0
      } :
      responseHeadersContentLength;
    const requestSize = parseInt(contentLength.value, 10);
    setByteLengthPerOrigin(origin, requestSize);

    return {};
  }

  let filter = browser.webRequest.filterResponseData(requestDetails.requestId);

  filter.ondata = event => {
    const origin = extractHostname(!requestDetails.originUrl ? requestDetails.url : requestDetails.originUrl);
    setByteLengthPerOrigin(origin, event.data.byteLength);

    filter.write(event.data);
  };

  filter.onstop = () => {
    filter.disconnect();
  };

  return {};
};

setBrowserIcon = (type) => {
  chrome.browserAction.setIcon({
    path: `icons/icon-${type}-48.png`
  });
};

addOneMinute = () => {
  let duration = localStorage.getItem('duration');
  duration = null === duration ? 1 : 1 * duration + 1;
  localStorage.setItem('duration', duration);
};

let addOneMinuteInterval;
let addOneSecondInterval;
let addFocusInterval;
let pauseStatus = "unpaused";
let userState = "active";

startAnalyse = () => {
    setBrowserIcon('on');
    chrome.webRequest.onHeadersReceived.addListener(
      headersReceivedListener,
      {urls: ["<all_urls>"]},
      ["blocking", "responseHeaders"]
    );


    if (!addOneMinuteInterval) {
      addOneMinuteInterval = setInterval(addOneMinute, 60000);
    }
    if (!addOneSecondInterval) {
      addOneSecondInterval = setInterval(setTimePerOrigin, 1000);
    }
    if (!addFocusInterval) {
      addFocusInterval = setInterval(checkFocus, 1000);
    }
    
    return;
};

pause = () => {
  if (addOneMinuteInterval) {
    clearInterval(addOneMinuteInterval);
    addOneMinuteInterval = null;
  }
  if (addOneSecondInterval) {
    clearInterval(addOneSecondInterval);
    addOneSecondInterval = null;
  }
  pauseStatus = "paused";
};

stopAnalyse = () => {
  setBrowserIcon('off');
  chrome.webRequest.onHeadersReceived.removeListener(headersReceivedListener);

  if (addOneMinuteInterval) {
    clearInterval(addOneMinuteInterval);
    addOneMinuteInterval = null;
  }
  if (addOneSecondInterval) {
    clearInterval(addOneSecondInterval);
    addOneSecondInterval = null;
  }if (addFocusInterval) {
    addFocusInterval = null;
  }
};

unpause = () => {
  if (!addOneMinuteInterval) {
    addOneMinuteInterval = setInterval(addOneMinute, 60000);
  }
 
  if (!addOneSecondInterval) {
    
    addOneSecondInterval = setInterval(setTimePerOrigin, 1000);
  }
  pauseStatus = "unpaused";
  return;
};

handleMessage = (request) => {

  if ('start' === request.action) {
    startAnalyse();
  }

  if ('stop' === request.action) {
    stopAnalyse();
  }
};

var currentTab;

function setTabInfo(tabId) {
  chrome.tabs.get(tabId, function (tab) {
    currentTab = extractHostname(tab.url);
  });
}
chrome.idle.setDetectionInterval(15);
chrome.idle.onStateChanged.addListener(function (state) {

  if((state === "locked" || state === "idle") && pauseStatus === "unpaused"){
    userState= "idle";
  }else if (state === "active" && pauseStatus === "paused"){
    userState= "active";
  }

});

function checkFocus() {
  chrome.windows.getLastFocused(function(window) {
      if(window.focused.toString() === "true" && pauseStatus === "paused" && userState === "active"){
        unpause();
      }else if((window.focused.toString() === "false" || userState === "idle") && pauseStatus === "unpaused"){
        pause();
      }
  });
}

chrome.tabs.onActivated.addListener(function (activeInfo) {
  setTabInfo(activeTabId = activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    setTabInfo(tabId);
});

chrome.runtime.onMessage.addListener(handleMessage);
