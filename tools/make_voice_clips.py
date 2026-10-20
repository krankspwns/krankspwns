# Generates the spoken reaction clips in public/audio/*.mp3 (GG, EZ, GL, WP, Faster leh, Aiyo, Steady lah, Oof).
# Needs: pip install sherpa-onnx numpy soundfile lameenc, and the Kokoro v1.0 multi-language model
# (https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models, kokoro-multi-lang-v1_0.tar.bz2, Apache-2.0)
# unpacked next to this script. Edit `clips` to change words, voices (speaker ids) or speed, then run it.
import sherpa_onnx, numpy as np, os, lameenc, soundfile as sf
d=os.environ.get('KOKORO_DIR','kokoro-multi-lang-v1_0')
cfg=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
    model=f'{d}/model.onnx',voices=f'{d}/voices.bin',tokens=f'{d}/tokens.txt',data_dir=f'{d}/espeak-ng-data',dict_dir=f'{d}/dict',
    lexicon=f'{d}/lexicon-us-en.txt,{d}/lexicon-zh.txt'),num_threads=4,debug=False,provider='cpu'))
tts=sherpa_onnx.OfflineTts(cfg)
# a clip is one phrase, or a list of phrases joined together: (text, speaker id, speed[, effect])
# effects: 'dip' = Mandarin third tone; 'rise' / 'fall' = the Singlish particle at the end lilts up (leh) or drops (lah);
# 'drawl' = a smug, drawn-out ending (Eeasyyy); 'hype' = a lift on the stressed word for a cheer
# speakers: 18 am_puck (an upbeat young man) for the gaming calls, 16 am_michael (deeper) for the smug EZ,
# 49 zm_yunjian for the Singlish ones (a low man's voice whose English has the accent), 14 am_fenrir for the Oof
# the model varies a little from run to run: listen, and keep the take you like
# 'dipm' = the third tone pitched for a man's voice
clips={
  'gg':[('Good game!',18,1.0,'hype')],
  'ez':[('Easy!',16,0.9,'drawl')],
  'gl':[('Good luck!',18,1.0,'hype')],
  'wp':[('Well played!',18,1.0,'hype')],
  'faster':[('Faster leh!',49,1.1)],
  'aiyo':[('爱',49,1.15),('Yo!',49,1.0,'wave')],
  'steady':[('Steady lah!',49,1.0)],
  'oof':[('Oof.',14,0.85)],
}
OVERLAP=0.055   # seconds two parts overlap, so a clip made of several parts runs together instead of sounding like separate words
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','audio'); os.makedirs(out,exist_ok=True)
def say(text,sid,speed,last=True):
    a=tts.generate(text,sid=sid,speed=speed); x=np.array(a.samples,dtype=np.float32); m=np.abs(x).max()
    lo=np.where(np.abs(x)>0.03*m)[0][0]                              # keep the soft first consonant (the F in Faster)
    hi=np.where(np.abs(x)>(0.04 if last else 0.12)*m)[0][-1]        # cut the long fade-out only where another part follows
    return x[max(0,lo-int(.005*a.sample_rate)):hi+int(.01*a.sample_rate)], a.sample_rate
def dip(x,sr,start=262,low=205,end=335,stretch=1.75):
    """Give a voiced sound the Mandarin third tone (falling-rising, 214): the pitch goes down to a low point, then climbs."""
    import parselmouth
    from parselmouth.praat import call
    snd=parselmouth.Sound(x.astype(np.float64),sampling_frequency=sr)
    pitch=snd.to_pitch(time_step=0.01,pitch_floor=120,pitch_ceiling=450)
    voiced=[pitch.xs()[i] for i,f in enumerate(pitch.selected_array['frequency']) if f>0]
    t0,t1=voiced[0],voiced[-1]
    manip=call(snd,'To Manipulation',0.01,100,450)
    tier=call(manip,'Extract pitch tier')
    call(tier,'Remove points between',t0-0.0001,t1+0.0001)
    call(tier,'Add point',t0,start); call(tier,'Add point',t0+0.42*(t1-t0),low); call(tier,'Add point',t1,end)
    call([manip,tier],'Replace pitch tier')
    dur=call(manip,'Extract duration tier')
    call(dur,'Add point',t0-0.001,1.0); call(dur,'Add point',t0,stretch); call(dur,'Add point',t1,stretch); call(dur,'Add point',t1+0.001,1.0)   # drag the vowel out: yoooo
    call([manip,dur],'Replace duration tier')
    return np.array(call(manip,'Get resynthesis (overlap-add)').values[0],dtype=np.float32)
def shape(x,sr,points,stretch=None):
    """Redraw the pitch over the voiced part of a clip. points: (where 0..1 through the voicing, pitch as a multiple of its median).
    stretch: (from, to, factor) drags that stretch of the voicing out, e.g. the final vowel of a drawl."""
    import parselmouth
    from parselmouth.praat import call
    snd=parselmouth.Sound(x.astype(np.float64),sampling_frequency=sr)
    pitch=snd.to_pitch(time_step=0.01,pitch_floor=70,pitch_ceiling=500)
    fr=pitch.selected_array['frequency']; voiced=[pitch.xs()[i] for i,f in enumerate(fr) if f>0]
    if len(voiced)<3: return x
    med=float(np.median(fr[fr>0])); t0,t1=voiced[0],voiced[-1]
    manip=call(snd,'To Manipulation',0.01,70,500)
    tier=call(manip,'Extract pitch tier')
    call(tier,'Remove points between',t0-0.0001,t1+0.0001)
    for w,m in points: call(tier,'Add point',t0+w*(t1-t0),med*m)
    call([manip,tier],'Replace pitch tier')
    if stretch:
        a,b,f=stretch; ta,tb=t0+a*(t1-t0),t0+b*(t1-t0); dur=call(manip,'Extract duration tier')
        call(dur,'Add point',ta-0.001,1.0); call(dur,'Add point',ta,f); call(dur,'Add point',tb,f); call(dur,'Add point',tb+0.001,1.0)
        call([manip,dur],'Replace duration tier')
    return np.array(call(manip,'Get resynthesis (overlap-add)').values[0],dtype=np.float32)
SHAPES={
    'rise':dict(points=[(0,1.0),(0.55,0.95),(0.72,1.0),(1,1.32)]),                 # leh: the particle climbs
    'fall':dict(points=[(0,1.05),(0.6,1.0),(1,0.72)]),                             # lah / oof: drops away
    'drawl':dict(points=[(0,1.0),(0.3,1.12),(0.65,1.0),(1,0.84)],stretch=(0.65,1.0,1.3)),   # Easyy: one smooth rise and fall (a sharp pitch drop between the syllables sounds like a second speaker)
    'wave':dict(points=[(0,1.0),(0.2,1.06),(0.4,1.3),(0.62,0.98),(0.8,1.22),(1,0.82)],stretch=(0.2,1.0,2.6)),   # the yo of aiyo: yoOoO
    'hype':dict(points=[(0,1.0),(0.2,1.18),(0.6,1.05),(1,0.85)]),                  # a bright, up-beat call
}
def join(pieces,sr):
    n=int(OVERLAP*sr); x=pieces[0]
    for q in pieces[1:]:
        n2=min(n,len(x),len(q)); fo=np.linspace(1,0,n2); fi=np.linspace(0,1,n2)
        x=np.concatenate([x[:-n2], x[-n2:]*fo+q[:n2]*fi, q[n2:]])
    return x
for k,parts in clips.items():
    pieces=[]; 
    for i,(text,sid,speed,*fx) in enumerate(parts):
        x,sr=say(text,sid,speed,last=(i==len(parts)-1))
        if 'dip' in fx: x=dip(x,sr)   # third tone on this part
        if 'dipm' in fx: x=dip(x,sr,start=150,low=112,end=195,stretch=2.3)
        for e in fx:
            if e in SHAPES: x=shape(x,sr,**SHAPES[e])
        pieces.append(x)
    x=join(pieces,sr)
    f=int(.012*sr); x[:f]*=np.linspace(0,1,f); x[-f:]*=np.linspace(1,0,f)
    x=x/np.abs(x).max()*0.9
    enc=lameenc.Encoder(); enc.set_bit_rate(64); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    data=enc.encode((x*32767).astype(np.int16).tobytes())+enc.flush()
    open(f'{out}/{k}.mp3','wb').write(data)
    print(k,[q[0] for q in parts],round(len(x)/sr,2),'s',len(data),'bytes')
