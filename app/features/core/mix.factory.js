(function() {
    'use strict';

    angular
        .module('app')
        .factory('MixFactory', MixFactory);

    MixFactory.$inject = [
        '$q', 'localStorageService', '$rootScope',
        'CollabFactory', 'ContextFactory',
        'TrackFactory', 'SoundFactory',
        'GridFactory'
    ];

    /* @ngInject */
    function MixFactory($q, localStorageService, $rootScope, CollabFactory, ContextFactory, TrackFactory, SoundFactory, GridFactory) {
        ////////////////
        // Array diff
        Array.prototype.diff = function(a) {
            return this.filter(function(i) {
                return a.indexOf(i) < 0;
            });
        };

        ////////////////
        // functions
        var service = {
            addAudioToTrack: addAudioToTrack,
            adjustTrackVolume: adjustTrackVolume,
            deleteSound: deleteSound,
            addTrack: addTrack,
            getEndMarker: getEndMarker,
            getSoundFromX: getSoundFromX,
            getTracks: getTracks,
            initTracks: initTracks,
            playAt: playAt,
            stopAudio: stopAudio,
            toggleMute: toggleMute,
            toggleSolo: toggleSolo,
            updateEndMarker: updateEndMarker
        }
        ////////////////

        ////////////////
        // variables
        var collabId;
        var tracks = [];
        var soloedTracks = [];

        var endLoc = 0;

        var soundsToLoad = 0;

        ////////////////
        // Root Scope Events
        $rootScope.$on('sounddrag', function(event, args) {
            var newLoc = args.newLoc;
            var newTrack = args.newTrack;
            var dragStart = args.dragStartX;
            var trackStart = args.trackStart;

            // get the sound obj from the mix
            var soundObj = getSoundFromX(trackStart, dragStart);
            // update the sound obj in the mix
            soundObj.gridLocation = newLoc;

            // check to see if the endLoc needs to be updated
            updateEndMarker(soundObj);

            // new track, so splice it from old track
            // and put into new track
            if(newTrack != trackStart) {
                soundObj.track = newTrack;

                var idx = tracks[trackStart].soundIds.indexOf(soundObj);
                tracks[trackStart].soundIds.splice(idx, 1);
                tracks[newTrack].soundIds.push(soundObj);
            }

            // reconstruct the sound obj for the DB because we don't 
            // want to resend the audio buffer
            var soundToSave = {
                "_id" : soundObj._id,
                "trackId" : soundObj.trackId,
                "fps" : soundObj.fps,
                "gridLocation" : newLoc, // the new position
                "track" : newTrack, // the new track number
                "filePath" : soundObj.filePath,
                "frameLength" : soundObj.frameLength
            }

            SoundFactory.updateSound(soundToSave);
        })

        /////////////////////
        // Function Definitions
        /////////////////////

        // set an internal reference to the tracks
        // if there are no tracks, create one
        function initTracks(collab) {
            collabId = collab._id;

            if (collab.trackIds.length == 0) {
                addTrack();
            } else {
                tracks = collab.trackIds;
            }

            soundsToLoad = 0;
            // figure out how many sounds need to be loaded
            for(var i = 0; i < tracks.length; i++) {
                soundsToLoad += tracks[i].soundIds.length;
            }

            // set up volume gain node
            // and mutesolo gain node
            for (var i = 0; i < tracks.length; i++) {
                var track = tracks[i];
                TrackFactory.addInitialEffectsChainToTrack(track);

                if (track.soundIds.length > 0) {
                    // get the sound buffers from the DB!
                    for (var j = track.soundIds.length - 1; j >= 0; j--) {
                        var soundId = track.soundIds[j];

                        track.soundIds.splice(j, 1);
                        SoundFactory.getSoundById(soundId).then(function(res) {
                            var sound = res.data.sound;
                            sound.buffer = res.data.buffer;

                            tracks[sound.track].soundIds.push(sound);

                            // check to see if we have a new end location
                            updateEndMarker(sound);

                            var canvas = GridFactory.createCanvas(sound.track, sound.gridLocation, sound.frameLength);
                            GridFactory.drawBuffer(canvas.width, canvas.height, canvas.getContext('2d'), sound.buffer);

                            soundsToLoad--;
                        }, function(err) {
                            if(err.status == 500) {
                                // TODO: elaborate this
                                soundsToLoad--;
                            }
                        });
                    }
                }
            }

            // load sounds
            console.log(tracks);

            return tracks;
        }

        function getTracks() {
            return tracks;
        }

        function getSoundFromX(trackNum, coordX) {
            var track = tracks[trackNum];
            if(track == null) {
                return null;
            }

            // iterate over the sounds in this track
            for(var i = 0; i < track.soundIds.length; i++) {
                var sound = track.soundIds[i];
                var soundEnd = sound.gridLocation + sound.frameLength;

                // check if coordX is within the bounds of this sound
                if(coordX >= sound.gridLocation && coordX < soundEnd) {
                    return sound;
                }
            }

            return null;
        }

        // add an empty track to the collab
        function addTrack() {
            var track = TrackFactory.createEmptyTrack("Audio Track");

            TrackFactory.addTrack(track).then(function(res) {
                var trackFromDB = res.data;
                CollabFactory.addTrackToCollab(collabId, res.data._id).then(function(res) {
                    TrackFactory.addInitialEffectsChainToTrack(trackFromDB);
                    tracks.push(trackFromDB);
                });
            });
        }

        function toggleMute(trackNum) {
            var track = tracks[trackNum];
            if (track.mute == true) {
                track.mute = false;
                track.muteSoloGainNode.gain.value = 1.0;
            } else {
                track.mute = true;
                track.muteSoloGainNode.gain.value = 0;
            }
        }

        function toggleSolo(trackNum) {
            var idx = soloedTracks.indexOf(tracks[trackNum]);
            if (idx >= 0) {
                soloedTracks.splice(idx, 1);

                if (soloedTracks.length > 0) {
                    tracks[trackNum].muteSoloGainNode.gain.value = 0;
                } else {
                    for (var i = 0; i < tracks.length; i++) {
                        if (tracks[i].mute == false) {
                            // unmute 
                            tracks[i].muteSoloGainNode.gain.value = 1.0;
                        }
                    }
                }
            } else {
                soloedTracks.push(tracks[trackNum]);

                // don't solo if track is already muted
                if (tracks[trackNum].mute == false) {
                    tracks[trackNum].muteSoloGainNode.gain.value = 1.0;
                }

                // mute nonsoled tracks
                var nonSoloed = tracks.diff(soloedTracks);
                for (var i = 0; i < nonSoloed.length; i++) {
                    nonSoloed[i].muteSoloGainNode.gain.value = 0;
                }
            }

        }

        function adjustTrackVolume(track) {
            var nodeGain = track.gain / 100;
            track.volumeGainNode.gain.value = nodeGain;

            TrackFactory.updateTrack(track);
        }

        function addAudioToTrack(num, buffer, gridLocation, frameLength, fps, soundModel, startLoc) {
            if (tracks[num].soundIds == null) {
                tracks[num].soundIds = [];
            }

            var track = tracks[num];

            soundModel.frameLength = frameLength;
            soundModel.gridLocation = gridLocation;

            // update DB entry
            SoundFactory.updateSound(soundModel).then(function(res) {
                // attach the buffer to the object after
                // the DB call, then save to the track
                res.data.buffer = buffer;
                track.soundIds.push(res.data);

                // check to see if this is the end of the song
                // for skipEnd functionality
                if (gridLocation + frameLength > endLoc) {
                    endLoc = gridLocation + frameLength;
                }
            });
        }

        function deleteSound(sound) { 
            // remove from internal data structure
            var track = tracks[sound.track];
            for(var i = 0; i < track.soundIds.length; i++) {
                if(track.soundIds[i]._id == sound._id) {
                    track.soundIds.splice(i, 1);
                }
            }
        }

        // play all audio tracks from the marker onward
        function playAt(gridBaseOffset, markerOffset, fps) {
            var context = ContextFactory.getAudioContext();

            // if there are tracks on solo
            // then play only those
            var iterateOver = tracks;

            for (var trackNum = 0; trackNum < iterateOver.length; trackNum++) {
                var track = iterateOver[trackNum];

                for (var i = 0; i < track.soundIds.length; i++) {
                    var sound = track.soundIds[i];
                    var audioStartLoc = sound.gridLocation;
                    var audioEndLoc = audioStartLoc + sound.frameLength;

                    if (markerOffset >= audioEndLoc) {
                        // we can ignore the clip if the marker 
                        // is already past it
                        continue;
                    } else if (markerOffset > audioStartLoc && markerOffset < audioEndLoc) {
                        var frameOffset = markerOffset - audioStartLoc;
                        // sampleOffset = (frames) * (seconds / frame) * (samples / second) = samples
                        var sampleOffset = frameOffset * (1 / fps) * (context.sampleRate);
                        var buffer = sound.buffer.slice(sampleOffset, sound.buffer.length);

                        ContextFactory.playAt(buffer, track.effectsChainStart, 0);
                    } else {
                        var soundStart = sound.gridLocation - markerOffset;
                        soundStart /= fps;

                        var startTime = soundStart + context.currentTime;
                        ContextFactory.playAt(sound.buffer, track.effectsChainStart, startTime);
                    }
                }
            }
        }

        function stopAudio() {
            ContextFactory.stopAudio();
        }

        function updateEndMarker(sound) {
            // check to see if the endLoc needs to be updated
            if(sound.gridLocation + sound.frameLength > endLoc) {
                endLoc = sound.gridLocation + sound.frameLength;
            }
        }

        function getEndMarker() {
            return endLoc;
        }

        return service;
    }
})();
