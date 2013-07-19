var blahloc;
var instanear = angular.module("InstaNear", []),
    InstaNear = {
        setPhotos: function() {

        }
    };

instanear.config(['$routeProvider', 
    function($routeProvider) {
        $routeProvider
            .when('/', { 
                action: 'thumbnails.currentLocation'
            })
            .when('/lat/:lat/lng/:lng', {
                action: 'thumbnails.location'
            }).
            when('/detail/:id', { 
                action: 'details'
            }).
            when('/location', {
                action: 'location'
            }).
            when('/error', {
                action: 'error'
            }).
            otherwise({redirectTo: '/'});
    }
]);

instanear.factory('Globals',
    function() {
        var globals = {},
            radius = 4000;

        globals.radius = function(r) {
            if (typeof r === 'number') { radius = r; }
            return radius;
        };

        return globals;
    }
);
instanear.factory('BrowserHistory', 
    ['$location',
    function($location) {
        var currentRoute = '',
            lastRoute = undefined,
            action = '',
            factory = {};

        factory.lastRoute = function(r) {
            if (typeof r === 'string') {
                lastRoute = r;
            }
            return lastRoute;
        };

        factory.action = function(a) {
            if (typeof a == 'string') { action = a; }
            return action;
        }
        factory.route = function(r) {
            if (typeof r === 'string') { 
                $location.url(r);
                currentRoute = r; 
            }
            return currentRoute;
        }
        return factory;
    }
]);

instanear.factory('ClientLocation',
    ['$q', '$rootScope',
    function($q, $rootScope) {
        var factory = {},
            clientLocation,
            defer = $q.defer();

            getLocation = function() {
                return { 
                    lat: clientLocation.coords.latitude, 
                    lng: clientLocation.coords.longitude 
                };
            },
            setLocation = function(pos) {
                clientLocation = pos;
                return defer.resolve(getLocation())
            };

        factory.locationNeeded = function() {
            return clientLocation === undefined;
        };
        factory.setLocation = function(pos) {
            clientLocation = pos;
          //  setLocation(pos);
        };

        // this needs to be renamed, it's confusing.  Should be something
        // like fetchLocation.
        factory.getLocation = function() {
            navigator.geolocation.getCurrentPosition(
                function(pos) { $rootScope.$apply(setLocation(pos)); },
                function(reason) { return defer.reject(reason); },
                1000
            )
        };

        factory.location = function() {
            if (!clientLocation) {
                return undefined; //this.promise();
            }
            return getLocation();

        };
        factory.promise = function() {
            this.getLocation();
            return defer.promise;
        }
        return factory;
    }]
);

instanear.factory('Error', function() {
    var factory = {},
        error = '';

    factory.setError = function(msg) {
        error = msg;
    };
    factory.getError = function() {
        return error;
    };

    return factory;
});

instanear.factory('Photo', function() {
    return function(obj) {
        var now = Math.floor(Date.now()/1000),
                  diff = now - obj.created_time,
                  timestr;

        if (diff < 60) { timestr = 'just now'; }
        else if (diff < 3600) { timestr = Math.floor(diff/60) + 'm ago'; }
        else if (diff < 86400) { timestr = Math.floor(diff/3600) + 'h ago'; }
        else { timestr = Math.floor(diff/86400) + 'd ago'; }

        var photo = {
            id: obj.id,

            thumbnail: obj.images.thumbnail.url,
            img: obj.images.standard_resolution,
        
            caption: obj.caption ? obj.caption.text : '',
            takenAt: obj.created_time,
            when: timestr,

            photographer: obj.user,
            username: obj.user.username,
            profile: obj.user.profile_picture,

            meta: {
                filter: obj.filter,
                likes: obj.likes.count,
                comments: obj.comments
            },

            location: {
                lat: obj.location.latitude,
                lng: obj.location.longitude
            },

            // src until the photo has loaded
            src: 'resources/instagram-icon-large.png'
        };
        return photo;
    };
});

instanear.factory('Instagram', 
    ['$q', '$http', 'ClientLocation', 'Error', 'Globals', 'Photo',
    function($q, $http, ClientLocation, Error, Globals, Photo) {
        var factory = {},
            // defer object for running $http
            deferred = $q.defer(),

            // list of images returned for this location
            images = [],

            // hash object of photo ids
            seenImages = {},

            // time argument for subsequent ajax requests
            maxTime = 99999999999,

            /*
            // at some point, Instagram just returns a single image.
            // This is the key to let the controllers know to stop asking for
            // more photos.
            */
            endOfPhotos = false,

            // the active photo. Used to communicate with detailCtrl.
            activeId = '';

            addPhotos = function(response) {
                var photo,
                    added;
                angular.forEach(response.data.data, function(p) {
                    photo = Photo(p);
                    if (!seenImages[photo.id]) {
                        seenImages[photo.id] = true;
                        images.push(photo);

                        if (maxTime > photo.takenAt) { 
                            maxTime = photo.takenAt; 
                        }
                        added = true;
                    }
                });

                if (!added) {
                    endOfPhotos = true;
                }
            },

            // thanks Instagram for hiding the real status inside an object, 
            // instead of setting the header like every sane person ever.
            checkResponseStatus = function(response) {
                return response.data.meta.code !== 200 ? 
                    $q.reject(response.data.meta.error_message) : 
                    response;
            },

            search = function(lat, lng, dist, maxTime) {
                var url = 
                    "https://api.instagram.com/v1/media/search?lat=" + lat +
                    "&lng=" + lng + 
                    '&distance=' + dist +
                    '&client_id=' + INSTAGRAM_CLIENT_ID +
                    // jsonp magic callback
                    '&callback=JSON_CALLBACK';
                if (maxTime) { url += '&max_timestamp=' + maxTime; }

                $http.jsonp(url, { method: 'GET', timeout: 10000 })
                    .then(checkResponseStatus)
                    .then(addPhotos, Error.setError);
                 
                //addPhotos(instaData);
            },
            // used in conjuction with Instagram.get
            parseImage = function(imgData) {
                var p = Photo(imgData.data.data);
                images.push(p);
                seenImages[photo.id] = true;
                activeId = p.id;
            }


        factory.get = function(id) {
            var url = 
              "https://api.instagram.com/v1/media/" + id + 
                "?client_id=" + INSTAGRAM_CLIENT_ID +
                '&callback=JSON_CALLBACK';
            $http.jsonp(url, { method: 'GET', timeout: 10000 })
              .then(parseImage);
        };

        factory.search = function(maxTime) {
            var loc = ClientLocation.location();
            return search(loc.lat, loc.lng, Globals.radius(), maxTime);
        };

        // clear out the previously fetched photos
        factory.refresh = function() {
            images = [];
            maxTime = 99999999999;
            this.search();
        };

        factory.fetchNext = function() {
            return this.search(maxTime);
        };

        factory.setActive = function(photoId) {
            activeId = photoId;
        };

        factory.getActive = function() {
            for (var i in images) {
                if (images[i].id === activeId) {
                    return images[i];
                }
            }
            return undefined;
        };

        factory.images = function() { return images; };

        return factory;
    }
]);

instanear.factory('Maps', 
    ['$q', '$rootScope', 'ClientLocation', 'Globals', 'Instagram', 
    function($q, $rootScope, ClientLocation, Globals, Instagram) {
        var factory = {},
            _address = '',

            MAP_ELT = 'map',
            map,
            marker,
            circle,
            settings = {},

            defer = $q.defer(),

            // want to make this a getter/setter for the address
            geocoder = new google.maps.Geocoder(),
            setGeocodeAddress = function(addr) {
                _address = addr;
                defer.resolve(addr);
            },
  
            reposition = function(googlePos) {
                // make it look like it came from the browser
                ClientLocation.setLocation(
                    {coords: { latitude: googlePos.latLng.jb, longitude: googlePos.latLng.kb}}
                );
                factory.setLocation(ClientLocation.location());
                factory.markerLocation(ClientLocation.location());
                factory.drawCircle();
                Instagram.refresh();
            };

        factory.create = function(pos) {
            if (!map) { 
                if (!pos) {  
                    pos = ClientLocation.location();
                }
                pos = new google.maps.LatLng(pos.lat, pos.lng);
                map = new google.maps.Map(document.getElementById(MAP_ELT),
                    { 
                        center: pos,
                        zoom: 13,
                        maxZoom: 15,
                        overviewMapControl: false,
                        panControl: false,
                        rotateControl: false,
                        streetViewControl: false,
                        mapTypeControl: false
                    }
                ); 
                marker = new google.maps.Marker({
                    map: map,
                    animation: google.maps.Animation.DROP,
                    position: pos
                });

                google.maps.event.addListener(map, 'click', function(e) {
                    $rootScope.$apply(reposition(e));
                });
            }
        };

        factory.getAddress = function() {
            return _address;
        };

        // move the map to addr
        factory.setLocation = function(pos, rezoom) {
            if (marker) {
                pos = new google.maps.LatLng(pos.lat, pos.lng);
                map.setCenter(pos);
                if (rezoom) 
                    map.setZoom(13);
            }
        };

        factory.markerLocation = function(pos) {
            if (marker) {
                if (pos) {
                    pos = new google.maps.LatLng(pos.lat, pos.lng);
                    marker.setPosition(pos);
                }
                return marker.getPosition();
            }
            return undefined;
        }

        factory.reverseGeocode = function(pos) {
            var pt = new google.maps.LatLng(pos.lat, pos.lng);
            if (pt.lat) {
                geocoder.geocode({ 'latLng': pt }, 
                    function(results, status) {
                        $rootScope.$apply(setGeocodeAddress(results[0].formatted_address));
                    }
                )
                return defer.promise;
            }
            return false;
        };

        factory.drawCircle = function() {
            var pos = ClientLocation.location();
            this.removeCircle();

            circle = new google.maps.Circle({
                center: new google.maps.LatLng(pos.lat, pos.lng),
                clickable: false,
                fillColor: '#0055ff',
                strokeColor: '#0055ff',
                radius: Globals.radius(),
                map: map
            });
        };

        factory.removeCircle = function() {
            if (circle) {
                circle.setMap(null);
                circle = null;
            }
        };

        factory.saveSettings = function(key) {
            settings[key] = {
              zoom: map.getZoom(),
              center: map.getCenter()
            }
        }
        factory.restoreSettings = function(key) {
            var s = settings[key];
            if (s) {
                map.setZoom(s.zoom);
                map.setCenter(s.center);
                this.drawCircle();
            }
        }


        factory.moveTo = function(container) {
            if ($(container) != $('#' + MAP_ELT).parent()) {
                $('#' + MAP_ELT).detach().appendTo($(container));
                google.maps.event.trigger(map, 'resize');
            }
        };

        return factory;
    }
]);

instanear.controller('pageController',
    ['$scope', '$location', '$route', '$routeParams', 
     'ClientLocation', 'Instagram', 'Maps', 'BrowserHistory',
    function($scope, $location, $route, $routeParams, 
      ClientLocation, Instagram, Maps, BrowserHistory) {

        $scope.routeChanged = function(previousRoute) {
            // still a little confused on compile/link lifecycle...kludge
            if (!$route.current) { $route.reload(); }
            else {
                var action = $route.current.action,
                    currentPosition,
                    // $routeParams lagging?
                    routeParams = $route.current.params;

                if (action === 'details') {
                    Instagram.setActive(routeParams.id);
                }
                else if (action === 'location') {
                    // do nothing                    
                }
                else if (action === 'error') {

                }
                else {
                    if (routeParams.lat && routeParams.lng) {
                        // check to see if the lat/lng matches current client location
                        currentPosition = ClientLocation.location();
                        if (routeParams.lat != currentPosition.lat ||
                            routeParams.lng != currentPosition.lng) {
                            // arguably, this watch conditional should be in ClientLocation
                            ClientLocation.setLocation();
                            // and then Instagram should watch the ClientLocation.location
                            Instagram.refresh();
                            // and then none of this logic would be involved in the thumbs, which
                            // shouldn't care about the location
                        }
                    }
                    else {
                        if (ClientLocation.location()) {
                            Maps.reverseGeocode(ClientLocation.location()).
                            then(Instagram.search)
                        }
                        else {
                            ClientLocation.promise().
                              then(Maps.reverseGeocode).
                              then(Instagram.search)
                        }
                    }
                    $scope.blur = false;
                    Instagram.setActive('');
                }
                BrowserHistory.action(action);
                return true;
            }
        };

        // roll your own routing:
        // http://www.bennadel.com/blog/2420-Mapping-AngularJS-Routes-Onto-URL-Parameters-And-Client-Side-Events.htm
        // http://blog.grio.com/2012/08/where-my-docs-at-a-smattering-of-pointers-on-angularjs-one-of-which-at-least-is-difficult-if-not-impossible-to-find-on-the-internet.html

        $scope.$on("$locationChangeSuccess",
            function(e, $currentRoute, $previousRoute ){
                var prev = $previousRoute.replace(/.*#/, '');
                if (BrowserHistory.lastRoute() === undefined) {
                    prev = '/'; 
                }
                // Update the rendering.
                BrowserHistory.lastRoute(prev);
                $scope.routeChanged($currentRoute.replace(/.*#/, ''));
            }
        );
    }
]);

instanear.controller('thumbCtrl',
    ['$scope', '$location', '$route', '$routeParams', '$window',
     'ClientLocation', 'Instagram', 'Maps', 'BrowserHistory',
    function($scope, $location, $route, $routeParams, $window,
      ClientLocation, Instagram, Maps, BrowserHistory) {
        $scope.updateLocation = function() {
            $scope.address = Maps.getAddress();
        };

        $scope.refresh = function() {
            ClientLocation.promise().
              then($scope.updateLocation).
              then(Instagram.search);
        };

        $scope.loadPage = function(newVal, oldVal, scope) {
            $scope.updateLocation();
            var photos = Instagram.images(),
                cutoff = photos.length - photos.length%5;
            $scope.photos = photos.slice(0, cutoff);
            // manually fire off location change to check state
            //$scope.routeChanged();
        };

        $scope.loadMore = function() {
            Instagram.fetchNext();
        };

        $scope.showDetail = function(photoId) {
            BrowserHistory.route('/detail/' + photoId);
            //$location.path('/detail/' + photoId);
        };

        $scope.watchBlur = function() {
            $scope.blur = !BrowserHistory.action().match(/^thumbnails/);
        };

        // will deep watch screw me over?
        $scope.$watch(Instagram.images, $scope.loadPage, true); 
        $scope.$watch(BrowserHistory.action, $scope.watchBlur, true); 
    }
]);

instanear.controller('detailCtrl', 
    ['$scope', '$location', '$route', 'Instagram', 'Maps', 'BrowserHistory',
    function($scope, $location, $route, Instagram, Maps, BrowserHistory) {
        $scope.imageId = null;
        $scope.active = false;
        $scope.photo = undefined;
        fakePhoto = { img: {  url: 'resources/instagram-icon-large.png' } }

        $scope.showHide = function() {
            var action = BrowserHistory.action();
            $scope.photo = Instagram.getActive();
            // we probably started on the details
            if (action === 'details' && $scope.photo === undefined) {
                Instagram.get($route.current.params.id);
            }
            else {
                $scope.photo ? $scope.show() : $scope.hide();
            }
        };

        $scope.show = function() {
            if ($scope.photo) {
                Maps.moveTo('#detail-map-container');
                Maps.markerLocation($scope.photo.location); 
                Maps.setLocation($scope.photo.location, true); 
                Maps.removeCircle();
                $scope.active = true;
            }
        };

        $scope.hide = function() {
            if ($scope.active) {
                $scope.active = false; 
                $scope.photo = undefined; 
                BrowserHistory.route(BrowserHistory.lastRoute());
            }
        };

        $scope.$watch(Instagram.getActive, $scope.showHide);
    }
]);

instanear.controller('locationCtrl',
    ['$scope', 'Globals', 'Maps', 'ClientLocation', 'BrowserHistory', 'Instagram',
    function($scope, Globals, Maps, ClientLocation, BrowserHistory, Instagram) {
        $scope.active = false; 

        $scope.hide = function() {
            $scope.active = false; 
            var prev = BrowserHistory.pop();
            BrowserHistory.route(prev);
        };

        $scope.showHide = function() {
            var action = BrowserHistory.action();
            // we probably started on the details
            action === 'location' ? $scope.show() : $scope.hide();
        };

        $scope.show = function() {
            Maps.moveTo('#location-map-container');
            Maps.restoreSettings('location-config');
            Maps.markerLocation(ClientLocation.location()); 
            $scope.active = true;
        };

        $scope.hide = function() {
            if ($scope.active) {
                $scope.active = false; 
                BrowserHistory.route(BrowserHistory.lastRoute());
                Maps.saveSettings('location-config');
            }
        };
        $scope.radius = function(r) {
            if (r) {
                Globals.radius(r);
                Maps.drawCircle();
            }
            return Globals.radius();
        }
        $scope.$watch(BrowserHistory.action, $scope.showHide);
    }
]);

instanear.controller('errorCtrl', 
    ['Error', '$location',
    function($scope, Error, $location) {
        $scope.displayError = function() {
            var msg = Error.getError();
            // route to error
            BrowserHistory.route('/error')
        };

        $watch(Error.getError, displayError);
    }]
);

instanear.directive('tap', function() {
    var tap = false;
    return function(scope, elt, attrs) {
        elt.bind('touchstart', function() {
            tap = true;
        });
        elt.bind('touchmove', function() {
            tap = false;
        });
        elt.bind('click', function() {
            scope.$apply(attrs['tap']);
        });

        return elt.bind('touchend', function() {
            if (tap) {
                scope.$apply(attrs['tap']);
            }
        });
    }
});

instanear.directive('pinch', function() {

});

instanear.directive('loaded', function() {
    return {
        restrict: 'A', 
        link: function(scope, elt, attrs) {
            var i = angular.element(elt),
                n = i.next()[0];
            i = i[0];

            i.onload = function() {
                n.style.backgroundImage = 'url(' + i.src + ')';
            }
        }
    }
});

instanear.directive('swap', function() {
    return {
        link: function(scope, elt, attrs) {
            var i = angular.element(elt),
                n = i.next()[0];
                i = i[0];
            n.src = 'resources/instagram-icon-large.png';
            i.onload = function() {
                n.src = i.src;
            }
        }
    }
});

instanear.directive('detail', function() {
    return {
        restrict: 'E',
        templateUrl: 'templates/detail.html'
    }
});

instanear.directive('config', function() {
    return {
        restrict: 'E',
        templateUrl: 'templates/config.html'
    }
});
instanear.directive('location', function() {
    return {
        restrict: 'E',
        templateUrl: 'templates/location.html'  
    }
});

instanear.directive('blur', function() {
    return {
        restrict: 'A',
        link: function(scope, elt, attrs) {
            var e = angular.element(elt)[0];
            scope.$apply(attrs['blur']) ?
                elt.addClass('blur') : 
                elt.removeClass('blur');
            }
        };
    }
);

instanear.run(['ClientLocation', 'Maps', function(ClientLocation, Maps) {
    ClientLocation.promise().then(Maps.create);
}]);
