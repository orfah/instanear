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

instanear.factory('BrowserHistory', 
    ['$location',
    function($location) {
        var currentRoute = '',
            lastRoute = undefined,
            action = '',
            factory = {};

        factory.lastRoute = function(r) {
            if (typeof r === 'string') {
                console.log('setting lastRoute: ' + r);
                lastRoute = r;
            }
            return lastRoute;
        };

        factory.action = function(a) {
            if (a) { action = a; }
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
                defer.resolve(getLocation())
            };

        factory.locationNeeded = function() {
            return clientLocation === undefined;
        };
        factory.setLocation = function(pos) {
            setLocation(pos);
        };

        // this needs to be renamed, it's confusing.  Should be something
        // like fetchLocation.
        factory.getLocation = function() {
            navigator.geolocation.getCurrentPosition(
                function(pos) { console.log('got position'); $rootScope.$apply(setLocation(pos)); },
                function(reason) { console.log('failed position'); return defer.reject(reason); },
                1000
            )
        };

        factory.location = function() {
            return getLocation();
        };
        factory.promise = function() {
            this.getLocation();
            return defer.promise;
        }
        return factory;
    }]
);

instanear.factory('Utility', function() {
    var utilities = {};
    utilities.showMap = function(targetId) {
        var m = $('#map'),
            previousId;
        if (!m.hasClass(targetId)) {
            previousId = m.parent().attr('id');
            m = m.detach();
            $('#' + targetId).append(m); 

            m.removeClass(previousId);
            m.addClass(targetId);
        }
    }
});

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
    ['$q', '$http', 'Error', 'Photo', 'ClientLocation',
    function($q, $http, Error, Photo, ClientLocation) {
        var factory = {},
            defaultRadius = 4000,
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

            fetch = function(lat, lng, dist, maxTime) {
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
            };
            
        factory.getThumbs = function(loc, oldest, radius) {
            fetch(loc.lat, loc.lng, radius);
        };

        factory.fetch = function(maxTime) {
            var loc = ClientLocation.location(),
                radius = radius || defaultRadius;
            return fetch(loc.lat, loc.lng, radius, maxTime);
        };

        // clear out the previously fetched photos
        factory.refresh = function() {
            images = [];
            this.fetch();
        };

        factory.fetchNext = function() {
            return this.fetch(maxTime);
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

        factory.images = function() { return images; }
        return factory;
    }
]);

instanear.factory('Maps', 
    ['$q', '$rootScope', 'ClientLocation',
    function($q, $rootScope, ClientLocation) {
        var factory = {},
            _address = '',

            MAP_ELT = 'map',
            map,
            marker,

            defer = $q.defer(),

            // want to make this a getter/setter for the address
            geocoder = new google.maps.Geocoder(),
            setGeocodeAddress = function(addr) {
                _address = addr;
                defer.resolve(addr);
            };

        factory.create = function(eltId, pos) {
            if (!map) { 
                if (!pos) {  
                    pos = ClientLocation.location();
                    pos = new google.maps.LatLng(pos.lat, pos.lng);
                }
                map = new google.maps.Map(document.getElementById(eltId),
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
            }
        };

        factory.getAddress = function() {
            return _address;
        };

        // move the map to addr
        factory.setLocation = function(pos) {
            pos = new google.maps.LatLng(pos.lat, pos.lng);
            
            this.create(MAP_ELT, pos);
            marker.setPosition(pos);
        };

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
                    // show detail
                  // move this to listen to the browser history
                    $scope.blur = true;
                    Instagram.setActive(routeParams.id);
                }
                else if (action === 'config') {

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
                        ClientLocation.promise().
                          then(Maps.reverseGeocode).
                          then(Instagram.fetch)
                    }
                    $scope.blur = false;
                    Instagram.setActive('');
                }
                console.log('logging action: ' + action);
                //BrowserHistory.push(previousRoute, action);
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
              then(Instagram.fetch);
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

        // will deep watch screw me over?
        $scope.$watch(Instagram.images, $scope.loadPage, true); 
    }
]);

instanear.controller('detailCtrl', 
    ['$scope', '$location', 'Instagram', 'Maps', 'BrowserHistory',
    function($scope, $location, Instagram, Maps, BrowserHistory) {
        $scope.imageId = null;
        $scope.active = false;
        $scope.photo = undefined;
        fakePhoto = { img: {  url: 'resources/instagram-icon-large.png' } }

        $scope.showHide = function() {
          /*
             var r = BrowserHistory.route();
            console.log('making decision about show/hide: ' + r);
            console.log('last: ' + BrowserHistory.last());
            */
            $scope.photo = Instagram.getActive();
            $scope.photo ? $scope.show() : $scope.hide();
        };

        $scope.show = function() {
            // being called at $digest time? 
            //if (showing === 'detail') {
                var m = $('#map');
            console.log('showing? ' + $scope.photo);
                if ($scope.photo) {
                    if (!m.hasClass('detail-map-container')) {
                      m = m.detach();
                      $('#detail-map-container').append(m); 

                      m.removeClass('location');
                      m.addClass('detail-map-container');
                    }
                    
                    Maps.setLocation($scope.photo.location); 
                    $scope.active = true;
                    // setTimeout here to delay load?
                }
        };

        $scope.hide = function() {
            if ($scope.active) {
                console.log('hiding? ' + BrowserHistory.lastRoute());
                $scope.active = false; 
                $scope.photo = undefined; 
                BrowserHistory.route(BrowserHistory.lastRoute());
            }
        };

        $scope.$watch(Instagram.getActive, $scope.showHide);
    }
]);

instanear.controller('locationCtrl',
    ['$scope', 'Maps', 'ClientLocation', 'BrowserHistory',
    function($scope, Maps, ClientLocation, BrowserHistory) {
        $scope.active = false; 
        $scope.show = function(page) {
            if (page === 'location') {
                var m = $('#map');
                if (!m.hasClass('detail')) {
                    m = m.detach();
                    $('#detail-map-container').append(m); 

                    m.removeClass('location');
                    m.addClass('detail');
                }
                Maps.setLocation(ClientLocation.location()); 
            }
        };
        $scope.hide = function() {
            $scope.active = false; 
            var prev = BrowserHistory.pop();
            //$location.path(prev);
            BrowserHistory.route(prev);
        };
        //$scope.$watch(BrowserHistory.last, $scope.show); 
    }
]);

instanear.controller('locationCtrl',
    ['$scope', '$location', 'Instagram', 'Maps', 'ClientLocation',
    function($scope, $location, Instagram, Maps, ClientLocation) {
        
    }]
);

instanear.controller('errorCtrl', 
    ['Error', '$location',
    function($scope, Error, $location) {
        $scope.displayError = function() {
            var msg = Error.getError();
            // route to error
            //$location.path('/error')
            BrowserHistory.route('/error')
        };

        $watch(Error.getError, displayError);
    }]
);

instanear.directive('tap', function() {
    var tap = false;
    return function(scope, elt, attrs) {
        elt.bind('touchstart', function() {
            return tap = true;
        });
        elt.bind('touchmove', function() {
            return tap = false;
        });
        elt.bind('click', function() {
            scope.$apply(attrs['tap']);
        });

        return elt.bind('touchend', function() {
            if (tap) {
                return scope.$apply(attrs['tap']);
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
            //scope.$apply(attrs['loaded']);
        }
          /*
        scope: { loaded: '=' },
        controller: function($scope, $element, $attrs, $location) {
            $scope.loaded($element);
        }
            */
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
