# Generates the four spoken reaction clips in public/audio/*.mp3.
# Needs: pip install sherpa-onnx numpy soundfile lameenc, and the Kokoro v1.0 multi-language model
# (https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models, kokoro-multi-lang-v1_0.tar.bz2, Apache-2.0)
# unpacked next to this script. Edit `clips` to change words, voices (speaker ids) or speed, then run it.
import sherpa_onnx, numpy as np, os, lameenc, soundfile as sf
d='kokoro-multi-lang-v1_0'
cfg=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
    model=f'{d}/model.onnx',voices=f'{d}/voices.bin',tokens=f'{d}/tokens.txt',data_dir=f'{d}/espeak-ng-data',dict_dir=f'{d}/dict',
    lexicon=f'{d}/lexicon-us-en.txt,{d}/lexicon-zh.txt'),num_threads=4,debug=False,provider='cpu'))
tts=sherpa_onnx.OfflineTts(cfg)
# a clip is one phrase, or a list of phrases joined together: (text, speaker id, speed[, 'dip' = Mandarin third tone])
clips={'faster':[('Faster leh!',45,1.12)],'aiyo':[('爱',45,1.2),('Yo!',45,1.3,'dip')],'steady':[('Steady lah!',45,1.05)],'oof':[('Ooph!',2,1.0)]}
OVERLAP=0.055   # seconds two parts overlap, so a clip made of several parts runs together instead of sounding like separate words
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','audio'); os.makedirs(out,exist_ok=True)
def say(text,sid,speed,last=True):
    a=tts.generate(text,sid=sid,speed=speed); x=np.array(a.samples,dtype=np.float32); m=np.abs(x).max()
    lo=np.where(np.abs(x)>0.03*m)[0][0]                              # keep the soft first consonant (the F in Faster)
    hi=np.where(np.abs(x)>(0.04 if last else 0.12)*m)[0][-1]        # cut the long fade-out only where another part follows
    return x[max(0,lo-int(.005*a.sample_rate)):hi+int(.01*a.sample_rate)], a.sample_rate
def dip(x,sr,start=262,low=205,end=335):
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
    return np.array(call(manip,'Get resynthesis (overlap-add)').values[0],dtype=np.float32)
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
        pieces.append(x)
    x=join(pieces,sr)
    f=int(.012*sr); x[:f]*=np.linspace(0,1,f); x[-f:]*=np.linspace(1,0,f)
    x=x/np.abs(x).max()*0.9
    enc=lameenc.Encoder(); enc.set_bit_rate(64); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    data=enc.encode((x*32767).astype(np.int16).tobytes())+enc.flush()
    open(f'{out}/{k}.mp3','wb').write(data)
    print(k,[q[0] for q in parts],round(len(x)/sr,2),'s',len(data),'bytes')
