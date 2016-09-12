
// A stringify helper
// Need to replace any double quotes in the data with the HTML char
//  as it is being placed in the HTML attribute data-context
function stringifyHelper(context) {
  var str = JSON.stringify(context);
  return str.replace(/"/g, '&quot;');
}

// Finally, register the helpers with Template7
Template7.registerHelper('stringify', stringifyHelper);

// Initialize app
var myApp = new Framework7({
  material: false,
  template7Pages: true,
  precompileTemplates: true,
  swipePanel: 'left',
  swipePanelActiveArea: '30',
  swipeBackPage: true,
  animateNavBackIcon: true,
  pushState: !!Framework7.prototype.device.os
});


// If we need to use custom DOM library, let's save it to $$ variable:
var $$ = Dom7;

var API_HOST = "https://build.phonegap.com";

// Add view
var mainView = myApp.addView('.view-main', {
    // Because we want to use dynamic navbar, we need to enable it for this view:
    dynamicNavbar: true,
    domCache: true
});

// Handle Cordova Device Ready Event
$$(document).on('deviceready', function() {
    console.log("Device is ready!");
    $$(document).on('submit', '#login', login);

    access_token = window.localStorage.getItem('access_token');
    
    if (access_token) {
        getApps(access_token);
    }
});

myApp.onPageInit('details', function(page) {
    $$('#run').on('click', runApp.bind(page.context));
    $$('#install').on('click', installApp.bind(page.context));
    $$('#compat').on('click', analyzePlugins.bind(page.context));
});

// clear localstorage when Logout clicked
myApp.onPageBack('results', function(page) {
  console.log('clearing localstorage');
  window.localStorage.clear();
})

function login(e) {
    e.preventDefault();

    var authWindow = cordova.InAppBrowser.open(API_HOST + "/authorize?client_id=b3e5cfc36aa66587b24f", "_blank", "clearcache=yes");

    authWindow.addEventListener('loadstart', function(e) {
        var url = e.url;
        if (url.match(/^(https?:\/\/)phonegap\.com\/?\?(code|error)=[a-zA-Z0-9]*$/)) {
            console.log('Callback url found.')
            var qs = getQueryString(url);
            if (qs['code']) {
                authWindow.close();
                PhonegapBuildOauth.authorizeByCode(qs['code'], function(a) {
                    access_token = a.access_token;
                    window.localStorage.setItem('access_token', access_token);
                    getApps(a.access_token);
                }, function(a) {
                    console.log("Auth failure: " + a.message);
                    myApp.alert('Login failed', 'Error');
                });
            } else if (qs['error']) {
                authWindow.close();
                console.log("Auth failure: " + a.message);
                myApp.alert('Login failed', 'Error');
            }
        }
    });

}

function getApps(access_token) {
    myApp.showPreloader();
    $$.ajax({
      dataType: "json",
      url: API_HOST + "/api/v1/apps?access_token=" + access_token,
      success: function(data) {
        myApp.hidePreloader();
        renderApps(data.apps, access_token);
      }, 
      failure: function() {
        myApp.hidePreloader();
        myApp.alert('Failed to fetch apps.')
      }
    });
}

function renderApps(appArray, token) {

    appArray.forEach(function(app, index, arr) {
        arr[index].icon_url = API_HOST + "/api/v1/apps/" + app.id + "/icon?access_token=" + token;
        arr[index].platform_phonegap_version = app.phonegap_versions[device.platform.toLowerCase().replace("windows", "winphone")];
    })
    
    mainView.router.load({
        template: myApp.templates.results,
        context: {
          apps: appArray
        },
      });

}

function runApp() {
  var app_id = this.id;
  var access_token = window.localStorage.getItem('access_token');
  console.log('running app ' + app_id);
  
  var container = $$('#progressbar');
  if (container.children('.progressbar').length) return; //don't run all this if there is a current progressbar loading
  myApp.showProgressbar(container, 0);

  $$.ajax({
    dataType: "json",
    url: API_HOST + "/api/v1/apps/" + app_id + "/www?access_token=" + access_token,
    success: loadApp,
    failure: function(e) {
      console.log('Failed to fetch app.', e);
      myApp.alert('Failed to fetch app.', 'Error');
    }
  });
}

function loadApp(data) { 
  var container = $$('#progressbar');
  navigator.apploader.fetch(decodeURI(data.www_url), function(d) {
    if (d.state == 'complete') {
      console.log('fetch complete');
      myApp.hideProgressbar(container);
      navigator.apploader.load(function() {
        console.log('Failed to load app.');
        myApp.alert('Failed to load app.', 'Error');
      });
    } else {
      console.log(Math.round(d.status) + '%');
      myApp.setProgressbar(container, d.status);
    }
  }, function() {
    console.log('Failed to fetch app.');
    myApp.alert('Failed to fetch app.', 'Error');
  });
}

function installApp() {
  window.open(this.install_url, "_system");
}

function analyzePlugins() {

  var access_token = window.localStorage.getItem('access_token');
  var context = this;

  myApp.showPreloader();
  $$.ajax({
    dataType: "json",
    url: API_HOST + "/api/v1/apps/" + this.id + "/plugins?access_token=" + access_token,
    success: function(data) {

      myApp.hidePreloader();

      if (typeof data.plugins != 'undefined') {

        var available_plugins = {};
        cordova.require('cordova/plugin_list').forEach(function(plugin) {
          available_plugins[plugin.pluginId] = plugin;
        });

        var plugin_missing = false;
        var desired_plugins = [];
          
        data.plugins.forEach(function(plugin) {
          // won't find whitelist plugin, in cordova/plugin_list
          if (plugin.name == 'cordova-plugin-whitelist') return;
          plugin.available = (typeof available_plugins[plugin.name] != 'undefined');
          desired_plugins.push(plugin);
        });

        var desired_cordova_version = context.phonegap_versions[device.platform.toLowerCase().replace("windows", "winphone")];

        mainView.router.load({
          template: myApp.templates.compatibility,
          context: {
            plugins: desired_plugins,
            cordova_version: {
              local: cordova.version,
              desired: desired_cordova_version,
              mismatch: mismatch(cordova.version, desired_cordova_version)
            }
          }
        });

      }

    },
    failure: function() {
      myApp.hidePreloader();
    }
  });

}

function getQueryString(url) {
    var a = url.slice((url.indexOf('?') + 1)).split('&')
    if (a == "") return {};
    var b = {};
    for (var i = 0; i < a.length; ++i)
    {
        var p=a[i].split('=', 2);
        if (p.length == 1)
            b[p[0]] = "";
        else
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
    }
    return b;
}

function mismatch(v1, v2) {
  var v1parts = v1.split('.'),
      v2parts = v2.split('.');

  while (v1parts.length < v2parts.length) v1parts.push("0");
  while (v2parts.length < v1parts.length) v2parts.push("0");

  if (v1parts[0] != v2parts[0]) {
    return 'major';
  } else if (v1parts[1] != v2parts[1]) {
    return 'minor';
  } else {
    return 'none';
  }

}
