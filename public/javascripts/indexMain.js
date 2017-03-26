function initMap() {
    $(document).ready(function () {
        var map = new google.maps.Map(document.getElementById('map'), {
            center: {lat: -25.363, lng: 131.044},
            zoom: 3
        });

        var postLocationData = function(locationData) {
            $.ajax({
                url: '/newLocation',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(locationData),
                dataType: 'json'
            });
        };

        // Try HTML5 geolocation.
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (position) {
                var pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                new google.maps.Marker({
                    position: pos,
                    map: map
                });
                map.setCenter(pos);
                postLocationData({pos: pos});
            }, function () {
                console.log('error');
                postLocationData({});
            });
        } else {
            postLocationData({});
        }
    });
}