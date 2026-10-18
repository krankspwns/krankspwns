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
# a clip is one phrase, or a list of phrases joined together: (text, speaker id, speed)
clips={'faster':[('Faster leh!',45,1.12)],'aiyo':[('爱',45,1.05),('Yo!',45,1.12)],'steady':[('Steady lah!',45,1.05)],'oof':[('Ooph!',2,1.0)]}
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','audio'); os.makedirs(out,exist_ok=True)
def say(text,sid,speed):
    a=tts.generate(text,sid=sid,speed=speed); x=np.array(a.samples,dtype=np.float32)
    idx=np.where(np.abs(x)>0.02)[0]
    return x[max(0,idx[0]-int(.01*a.sample_rate)):min(len(x),idx[-1]+int(.03*a.sample_rate))], a.sample_rate
for k,parts in clips.items():
    pieces=[]; 
    for (text,sid,speed) in parts:
        x,sr=say(text,sid,speed); pieces.append(x)
    x=np.concatenate([pieces[0]]+[np.concatenate([np.zeros(int(.015*sr),dtype=np.float32),q]) for q in pieces[1:]])
    f=int(.012*sr); x[:f]*=np.linspace(0,1,f); x[-f:]*=np.linspace(1,0,f)
    x=x/np.abs(x).max()*0.9
    enc=lameenc.Encoder(); enc.set_bit_rate(64); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    data=enc.encode((x*32767).astype(np.int16).tobytes())+enc.flush()
    open(f'{out}/{k}.mp3','wb').write(data)
    print(k,[t for t,_,_ in parts],round(len(x)/sr,2),'s',len(data),'bytes')
