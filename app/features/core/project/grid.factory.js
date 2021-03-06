(function() {
    'use strict';

    angular
        .module('app')
        .factory('GridFactory', GridFactory);

    GridFactory.$inject = ['$window', '$rootScope'];

    /* @ngInject */
    function GridFactory($window, $rootScope) {

        //////////////////////////
        // Functions
        //////////////////////////
        var service = {
            createCanvas: createCanvas,
            drawBuffer: drawAudioBuffer,
            getTrackNumFromY: getTrackNumFromY,
            removeCanvas: removeCanvas
        };

        //////////////////////////
        // Variables
        //////////////////////////
        var borderHeight = 0;
        var gridRulerHeight = 16;
        var topNavHeight = 0;
        var topNavHeightAbsolute = 60;
        var trackHeight = 100;
        var trackListWidth = 215;

        var dragEndX = 0;
        var dragStartLocX = 0;
        var mouseDragEndX = 0;
        var mouseDragStartX = 0;
        var mouseOffset = 0;
        var trackStart = 0;

        //////////////////////////
        // Register Event Listeners
        //////////////////////////
        document.getElementById('grid').addEventListener('dragover', dragover)
        document.getElementById('grid').addEventListener('drop', drop);

        return service;
        //////////////////////////
        // Function Definitions
        //////////////////////////
        function createCanvas(trackNum, gridLocation, length) {
            var grid = document.getElementById('grid');
            var div = document.createElement('div');

            // set up drag and drop
            div.setAttribute('draggable', true);
            div.addEventListener('dragstart', dragstart);
            div.addEventListener('dragend', dragend);

            div.classList += " audioClip";
            div.style.width = length + 'px';
            div.style.left = gridLocation + 'px';
            
            div.style.top = gridRulerHeight + topNavHeight + (trackNum * trackHeight) + 'px';

            var canvas = document.createElement('canvas');
            canvas.classList += " clipCanvas";

            div.appendChild(canvas);
            grid.appendChild(div);

            // extend width of mixer ui if needed
            var mixer = document.getElementById("mixBoard");
            if(gridLocation + length > mixer.offsetWidth) {
                mixer.style.width = mixer.offsetWidth + length + "px";
            }

            return canvas;
        }

        // draws an audio buffer on a canvas 2d context with a given width/height
        function drawAudioBuffer(canvas, data) {
            var width = canvas.width;
            var height = canvas.height;
            var context = canvas.getContext('2d');
            var step = Math.ceil(data.length / width);
            var amp = (height) / 2;

            context.fillStyle = "#ffc500";
            context.clearRect(0, 0, width, height);
            for(var i=0; i < width; i++){
                var min = 1.0;
                var max = -1.0;
                for (var j = 0; j < step; j++) {
                    var datum = data[(i * step) + j]; 
                    if (datum < min)
                        min = datum;
                    if (datum > max)
                        max = datum;
                }
                context.fillRect(i, (1 + min) * amp, 1, Math.max(1,(max - min) * amp));
            }
        }

        // based on a y location in the grid
        // return the track number this location is correlates to
        function getTrackNumFromY(y) {
            y = y - gridRulerHeight - topNavHeightAbsolute;
            y /= trackHeight;
            return Math.floor(y);
        }

        function removeCanvas(canvas) {
            var div = canvas.parentNode;
            var grid = div.parentNode;

            grid.removeChild(div);
        }

        /////////////////////
        // Drag & Drop
        /////////////////////
        function dragstart(e) {
            var mixContainer = document.getElementById('mixBoard');

            dragStartLocX = e.target.offsetLeft;
            mouseDragStartX = e.clientX;
            mouseOffset = e.clientX - e.target.offsetLeft;

            // chrome was recording pageY coordinates weirdly, 
            // so im gonna calculate y-coord using clientY + scrollTop
            var yCoord = e.clientY;
            
            yCoord += mixContainer.scrollTop;

            trackStart = getTrackNumFromY(yCoord);
            return false;
        }

        function dragover(e) {
            e.preventDefault();
            return false;
        }

        function drop(e) {
            e.stopPropagation();
            return false;
        }

        function dragend(e) {
            var mixContainer = document.getElementById('mixBoard');

            ///////////////////////////
            // Move the sound clip 

            ////////
            // x-axis movement
            var mouseDragEndX = e.clientX + mouseOffset;
            var dragDelta = mouseDragEndX - mouseDragStartX;

            // move the clip in the x direction
            var leftOffset = parseInt(e.target.style.left);
            leftOffset += dragDelta;

            // check left bound
            if(leftOffset < trackListWidth) {
                leftOffset = trackListWidth;
            }

            e.target.style.left = leftOffset + 'px';

            ////////
            // check for y-axis movement

            // chrome was recording pageY coordinates weirdly, 
            // so im gonna calculate y-coord using clientY + scrollTop
            var yCoord = e.clientY + mixContainer.scrollTop;
            var dragEndY = yCoord;
            dragEndY = dragEndY - topNavHeightAbsolute - gridRulerHeight;

            // calculate track number based on y-axis movement
            var trackNum = Math.floor((dragEndY + (dragEndY % trackHeight)) / trackHeight) - 1;

            if(trackNum < 0) trackNum = 0;

            e.target.style.top = 
                gridRulerHeight + topNavHeight + (trackNum * trackHeight) + 'px';

            ///////////////////////////
            // Save the new position of the sound clip
            $rootScope.$broadcast("sounddrag", {
                newLoc: leftOffset,
                newTrack: trackNum,
                dragStartX: dragStartLocX,
                trackStart: trackStart
            })
            
            // moving a sound clip affects playback
            $rootScope.$broadcast("refreshPlay");

            return false;
        }
    }
})();