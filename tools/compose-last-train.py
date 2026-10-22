"""Compose Last Train's original looping score. Requires numpy and ffmpeg.
No samples or third-party music. 16 bars at 72 BPM, D minor, piano and bowed pads.
"""
from pathlib import Path
import subprocess, tempfile, wave
import numpy as np
sr = 24000
beat = 60 / 72
length = 16 * 4 * beat
size = round(length * sr)
audio = np.zeros((size, 2), dtype=np.float64)
def hz(midi): return 440 * 2 ** ((midi - 69) / 12)
def add(note, start, duration, level, pad=False, pan=0):
    t = np.arange(round(duration * sr)) / sr
    f = hz(note)
    if pad:
        tone = sum(np.sin(2*np.pi*f*h*t + .15*np.sin(2*np.pi*.13*t)) / h**2 for h in range(1,5))
        tone += .3*np.sin(2*np.pi*f*1.002*t)
        env = np.minimum(t/1.2,1) * np.minimum((duration-t)/1.8,1)
    else:
        tone = sum(np.sin(2*np.pi*f*h*(1 + h*h*.00004)*t) * np.exp(-t*(.7+h*.15)) / h**1.65 for h in range(1,8))
        env = np.minimum(t/.008,1) * np.minimum((duration-t)/.4,1)
    signal = tone * env * level
    ids = (round(start*sr) + np.arange(len(t))) % size
    for ch,gain in enumerate([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)]):
        np.add.at(audio[:,ch], ids, signal*gain)
chords = [[38,53,57,62],[34,53,58,62],[31,50,55,58],[33,52,57,61]]
melody = [74,69,65,69,70,65,62,65,67,62,65,70,69,64,61,67]
for bar in range(16):
    chord = chords[(bar//2)%4]; start = bar*4*beat
    for j,note in enumerate(chord): add(note,start,4*beat+1.8,.10 if j else .12,True,(-.22,.12,-.1,.25)[j])
    for i,idx in enumerate([1,2,3,2]): add(chord[idx],start+i*beat,3.8,.15,pan=(-.25 if i%2 else .25))
    if bar%2==0: add(melody[bar],start+beat*.5,5,.14,pan=.1)
    if bar%2==1: add(melody[bar],start+beat*2.5,4.5,.10,pan=-.1)
# Circular early reflections keep the end-to-start seam continuous.
original=audio.copy()
for delay,gain in [(0.17,.12),(.39,.09),(.73,.06),(1.13,.04)]: audio += np.roll(original,round(delay*sr),axis=0)[:,::-1]*gain
audio = np.tanh(audio*.9)
audio *= .78 / max(np.max(np.abs(audio)),.001)
root = Path(__file__).resolve().parents[1]
output = root/'public/last-train/night-carriage.mp3'
with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
    with wave.open(tmp.name,'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(sr)
        wav.writeframes((audio*32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',tmp.name,'-codec:a','libmp3lame','-b:a','96k','-metadata','title=Night Carriage','-metadata','artist=Last Train',str(output)],check=True)
print(f'Composed {length:.1f}s → {output.name}')
