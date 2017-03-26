var visitData;
var map;

var socket = io.connect("https://localhost:8888");


function initMap() {

    $.ajax("/recentData", {
        dataType: "json",
        success: function (data) {
            visitData = data;

            $(document).ready(function () {
                map = new google.maps.Map(document.getElementById('map'), {
                    zoom: 3,
                    center: {lat: 40.819024, lng: -74.802508}
                });
                if (visitData !== undefined) {
                    for (let i = 0; i < visitData.length; i++) {
                        let cVisit = visitData[i];
                        let lat = cVisit['latitude'];
                        let lng = cVisit['longitude'];
                        if (lat !== null && lng !== null) {
                            new google.maps.Marker({
                                position: {lat: lat, lng: lng},
                                map: map
                            });
                        }
                    }
                }

                socket.on('visit', function(data) {
                    new google.maps.Marker({
                        position: data['pos'],
                        map: map
                    });
                });

            });
        },
        error: function (error) {
            console.log(error);
        }
    });

}
