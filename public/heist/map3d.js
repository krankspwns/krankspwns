/* First-person museum, rendered locally with self-hosted three.js and artwork.
   Server-timed movement, walls and private visibility remain authoritative.
   Touch and keyboard movement are predicted locally; WebGL failures use map.js. */
(() => {
  "use strict";
  const W = HeistWorld,
    S = 0.1, // three.js units per world unit
    THREE_URL = "/vendor/three-0.170.0.module.min.js",
    RADIUS = 7, // how close to a wall your character may get
    SYNC_MS = 260,
    LOOKAHEAD = 90;
  const COLORS = [
    "#ded1ac", "#9d3c51", "#344f9e", "#e8d9b4", "#bd8a34", "#3f7460",
    "#ac4365", "#3c5977", "#26323a", "#ac533a", "#347a78", "#69636b",
  ];
  const SKINS=[0xd4a07b,0xc98e65,0xd9aa86,0xd8b18e,0xc79372,0xcc9874,0xd9a582,0xc69878,0xd4a687,0xc98f6a,0xdbaa85,0xbd855e];
  const LOT = { lobby: 4, gallery: 0, vault: 2, security: 3, workshop: 5, service: 7 };
  let loading = null;
  const loadThree = () => (loading ||= import(THREE_URL));
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const lots = img("/grand-con/lots.webp"), galleryArt=img("/heist/gallery-art.webp");
  const point = (x, y) => ({ x, y });
  const closedDoors = (s) => (s?.sabotage?.kind === "door" ? [s.sabotage.door] : []);
  // a character fits where its four sides fit
  const fits = (p, closed) =>
    W.walkable(p, closed) &&
    W.walkable({ x: p.x + RADIUS, y: p.y }, closed) && W.walkable({ x: p.x - RADIUS, y: p.y }, closed) &&
    W.walkable({ x: p.x, y: p.y + RADIUS }, closed) && W.walkable({ x: p.x, y: p.y - RADIUS }, closed);

  function webgl() {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch { return false; }
  }

  window.MuseumMap3D = class {
    static supported() {
      return !/[?&]map=2d\b/.test(location.search) && !!window.MuseumMap && webgl();
    }
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.hooks = hooks;
      this.keys = new Set();
      this.wasMoving = false;
      this.destroyed = false;
      this.stick = { x: 0, y: 0 };
      this.yaw = 0; // 0 looks at the Lobby's far wall
      this.pitch = 0;
      this.bob = 0;
      this.fp = true; // the museum is only ever seen through your own eyes
      canvas.dataset.map = "3d";
      canvas.__map = this;
      this.loading = document.createElement("div");
      this.loading.className = "map3d-loading";
      this.loading.textContent = "Opening the museum…";
      canvas.parentElement?.append(this.loading);
      this.ready = this.boot().catch((e) => { console.warn("3D museum unavailable", e); this.fallback(); });
    }
    /* ---------- fallback to the flat map ---------- */
    fallback() {
      if (this.destroyed || this.inner) return;
      this.stopLoop();
      this.loading?.remove();
      const flat = this.canvas.cloneNode(false);
      flat.dataset.map = "2d";
      this.canvas.replaceWith(flat);
      this.releaseGl();
      this.canvas = flat;
      this.inner = new MuseumMap(flat, this.hooks);
      this.keys = this.inner.keys;
    }
    drawCamera(canvas, room, players, people) {
      if (this.inner) return this.inner.drawCamera(canvas, room, players, people);
      const proxy = { floor: (this.flatFloor ||= MuseumMap.floor()), character: MuseumMap.prototype.character };
      MuseumMap.prototype.drawCamera.call(proxy, canvas, room, players, people);
    }
    /* the player is looking at a console (a job is open): the camera moves in and up */
    // a trail of lights on the floor leading to the job you chose
    guide(p) { this.guideTo = p ? { ...point(p.x, p.y), label: p.label } : null; this.guidePath = null; }
    guideDots(s, t, now) {
      const T = this.T, g = this.guideTo;
      this.dots ||= [];
      let n = 0;
      if (g && this.me && W.distance(this.me, g) >= 26) {
        if (!this.guidePath || t - this.guideAt > 250) { this.guideAt = t; this.guidePath = W.route(this.me, g, closedDoors(s)); }
        const path = this.guidePath;
        this.guideHeading = path?.[1] || g;
        if (path) {
          const gap = 13, off = ((t / 1000) * 24) % gap;
          let carry = off;
          const here = this.me;
          let a = here;
          for (let i = 1; i < path.length; i++) {
            const b = path[i], len = W.distance(a, b);
            for (let d = carry; d < len; d += gap) {
              if (n >= 90) break;
              let m = this.dots[n];
              if (!m) {
                if (!this.chevron) { const sh = new T.Shape(); sh.moveTo(0, 0.55); sh.lineTo(0.6, -0.15); sh.lineTo(0.6, -0.55); sh.lineTo(0, -0.05); sh.lineTo(-0.6, -0.55); sh.lineTo(-0.6, -0.15); sh.closePath(); this.chevron = new T.ShapeGeometry(sh); }
                m = this.dots[n] = new T.Mesh(this.chevron, new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, depthWrite: false, side: T.DoubleSide }));
                m.rotation.order = "YXZ"; this.scene.add(m);
              }
              const k = len ? d / len : 0;
              m.visible = true;
              m.position.set((a.x + (b.x - a.x) * k) * S, 0.07, (a.y + (b.y - a.y) * k) * S);
              m.rotation.set(-Math.PI / 2, Math.atan2(-(b.x - a.x), -(b.y - a.y)), 0);
              m.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t / 260 - n * 0.7));
              n++;
            }
            carry = ((carry - len) % gap + gap) % gap;
            a = b;
          }
        }
      }
      for (; n < this.dots.length; n++) this.dots[n].visible = false;
    }
    focus(p) { this.zoomTo = p ? point(p.x, p.y) : null; }
    destroy() {
      this.destroyed = true;
      this.stopLoop();
      this.loading?.remove();
      this.inner?.destroy();
      this.observer?.disconnect();

      this.stickEl?.remove();
      this.compassEl?.remove();
      this.canvas.removeEventListener("pointerdown", this.pointer);
      this.canvas.removeEventListener("pointermove", this.drag);
      this.canvas.removeEventListener("pointerup", this.dragEnd);
      this.canvas.removeEventListener("pointercancel", this.dragEnd);
      removeEventListener("keydown", this.keydown);
      removeEventListener("keyup", this.keyup);
      removeEventListener("blur", this.blur);
      this.releaseGl();
    }
    stopLoop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    releaseGl() {
      this.scene?.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])m.dispose();});
      try { this.renderer?.dispose(); this.renderer?.forceContextLoss(); } catch {}
      for (const t of this.textures || []) t.dispose();
      this.environmentTarget?.dispose();
      this.renderer = null;
    }

    /* ---------- set up ---------- */
    async boot() {
      const THREE = (this.T = await loadThree());
      if (this.destroyed) return;
      const canvas = this.canvas;
      const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: matchMedia('(pointer: fine)').matches, powerPreference: "high-performance" }));
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x080f18);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.12;
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      this.textures = [];
      const scene = (this.scene = new THREE.Scene());
      scene.background = new THREE.Color(0x050d14);
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
      this.camPos = new THREE.Vector3(8, 18, 24);
      this.camLook = new THREE.Vector3(8, 0, 8);
      scene.add(this.camera);
      this.environment();
      this.lights();
      this.build();
      const refreshArt=()=>{if(this.destroyed||this.inner)return;for(const p of this.paintings||[]){p.mesh.material.map=this.paintingTexture(p.index);p.mesh.material.needsUpdate=true;}};
      galleryArt.decode().then(refreshArt).catch(()=>{});
      this.makeHands();
      this.scene.traverse(o=>{if(o.isMesh&&!o.material?.transparent&&!o.material?.isMeshBasicMaterial){o.castShadow=true;o.receiveShadow=true;}});
      this.people = new Map();
      this.footprints = [];
      this.rings = [];
      this.last = performance.now();
      this.syncAt = 0;
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
      this.resize();
      this.listen();
      this.stickControl();
      this.viewControl();
      this.applyView();
      this.loading?.remove();
      this.loop();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height || !this.renderer) return;
      this.renderer.setSize(r.width, r.height, false);
      this.camera.aspect = r.width / r.height;
      this.camera.updateProjectionMatrix();
    }
    tex(canvas) {
      const t = new this.T.CanvasTexture(canvas);
      t.colorSpace = this.T.SRGBColorSpace;
      t.anisotropy = 4;
      this.textures.push(t);
      return t;
    }
    environment(){
      const T=this.T,c=document.createElement('canvas');c.width=512;c.height=256;
      const g=c.getContext('2d'),sky=g.createLinearGradient(0,0,0,256);sky.addColorStop(0,'#b6c5cf');sky.addColorStop(.48,'#667475');sky.addColorStop(.55,'#44494a');sky.addColorStop(1,'#30251e');g.fillStyle=sky;g.fillRect(0,0,512,256);
      for(const [x,y,r,color]of [[90,80,100,'255,231,190'],[380,80,80,'203,230,250'],[260,35,65,'255,249,228']]){const glow=g.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,'rgba('+color+',1)');glow.addColorStop(.5,'rgba('+color+',.6)');glow.addColorStop(1,'rgba('+color+',0)');g.fillStyle=glow;g.fillRect(x-r,y-r,r*2,r*2);}
      const source=new T.CanvasTexture(c);source.colorSpace=T.SRGBColorSpace;source.mapping=T.EquirectangularReflectionMapping;
      const pmrem=new T.PMREMGenerator(this.renderer);this.environmentTarget=pmrem.fromEquirectangular(source);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.85;source.dispose();pmrem.dispose();
    }
    architecture(r){
      const T=this.T,x=r.x*S,z=r.y*S,w=r.w*S,d=r.h*S,gold=this.mat(0xc8ab70,{metalness:.65,roughness:.32}),stone=this.mat(0xaaa68e,{roughness:.7});
      // Corner pilasters leave the actual door openings and walking space clear.
      for(const dx of [.28,w-.28])for(const dz of [.28,d-.28]){this.box(.48,7.3,.48,stone,x+dx,.15,z+dz,this.tallG);this.box(.72,.2,.72,gold,x+dx,7.4,z+dz,this.tallG);this.box(.65,.2,.65,gold,x+dx,.05,z+dz,this.tallG);}
      for(const dx of [w*.16,w*.84]){
        const light=new T.Mesh(new T.SphereGeometry(.12,10,8),new T.MeshBasicMaterial({color:0xffe6af}));light.position.set(x+dx,4.6,z+.18);this.tallG.add(light);
        this.box(.12,.6,.18,gold,x+dx,3.95,z+.12,this.tallG);
        const glow=new T.Mesh(new T.PlaneGeometry(2.3,3.6),new T.MeshBasicMaterial({map:this.warmGlow(),transparent:true,opacity:.42,depthWrite:false}));glow.position.set(x+dx,4.6,z+.08);this.tallG.add(glow);
      }
      const pool=new T.Mesh(new T.PlaneGeometry(15,15),new T.MeshBasicMaterial({map:this.warmGlow(),transparent:true,opacity:.12,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.set(x+w/2,.018,z+d/2);this.scene.add(pool);
    }
    warmGlow(){return this.warmTex||=this.canvasTex(64,64,(g,w,h)=>{const a=g.createRadialGradient(32,32,0,32,32,32);a.addColorStop(0,'#ffe2ad99');a.addColorStop(.3,'#ffcb6755');a.addColorStop(1,'#ffcf7000');g.fillStyle=a;g.fillRect(0,0,w,h);});}

    lights() {
      const T=this.T,scene=this.scene;
      this.ambient=new T.AmbientLight(0xb7c9e2,.6);
      this.sky=new T.HemisphereLight(0xc9e1e8,0x3d241e,.8);
      this.sun=new T.DirectionalLight(0xffdfaf,2.1);
      this.sun.position.set(4,28,28);this.sun.castShadow=true;
      this.sun.shadow.mapSize.setScalar(matchMedia('(pointer: fine)').matches?1024:512);
      Object.assign(this.sun.shadow.camera,{left:-19,right:19,top:19,bottom:-19,near:1,far:65});
      this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.035;
      this.hero=new T.PointLight(0xffe5c4,20,23,2);
      scene.add(this.ambient,this.sky,this.sun,this.sun.target,this.hero);
      this.roomLights=[];
    }

    label(text, color = "#f4dc9c", size = 28, seen = true) {
      const c = document.createElement("canvas"), g = c.getContext("2d");
      g.font = `800 ${size}px Inter, system-ui, sans-serif`;
      const w = Math.ceil(g.measureText(text).width) + 28;
      c.width = w; c.height = size + 20;
      g.font = `800 ${size}px Inter, system-ui, sans-serif`;
      g.fillStyle = "rgba(7,23,34,.78)";
      g.beginPath(); g.roundRect(0, 0, c.width, c.height, 12); g.fill();
      g.fillStyle = color; g.textBaseline = "middle"; g.fillText(text, 14, c.height / 2 + 1);
      const sprite = new this.T.Sprite(new this.T.SpriteMaterial({ map: this.tex(c), transparent: true, depthWrite: false, depthTest: !seen }));
      const hgt = size > 21 ? 1.1 : 0.85;
      sprite.scale.set((c.width / c.height) * hgt, hgt, 1);
      sprite.renderOrder = 10;
      return sprite;
    }
    /* ---------- textures drawn in code ---------- */
    rng(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }
    canvasTex(w, h, draw, repeat = false) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      draw(c.getContext("2d"), w, h);
      const t = this.tex(c);
      if (repeat) { t.wrapS = t.wrapT = this.T.RepeatWrapping; }
      return t;
    }
    shade(hex, k) {
      const c = new this.T.Color(hex); c.multiplyScalar(k); return "#" + c.getHexString();
    }
    // wallpaper above, a wooden panelled dado below, a gold chair rail between
    wallTexture(room) {
      const seed = [...room.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7), rnd = this.rng(seed);
      return this.canvasTex(256, 256, (g, w, h) => {
        const base = new this.T.Color(room.color).multiplyScalar(1.7);
        g.fillStyle = "#" + base.getHexString(); g.fillRect(0, 0, w, h);
        // damask-like diamonds
        g.strokeStyle = "rgba(255,240,205,.10)"; g.lineWidth = 2;
        for (let x = 0; x < w; x += 64) for (let y = 0; y < h * 0.62; y += 64) {
          g.beginPath(); g.moveTo(x + 32, y + 8); g.lineTo(x + 56, y + 32); g.lineTo(x + 32, y + 56); g.lineTo(x + 8, y + 32); g.closePath(); g.stroke();
          g.fillStyle = "rgba(255,240,205,.07)"; g.beginPath(); g.arc(x + 32, y + 32, 6, 0, 7); g.fill();
        }
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
        // top shading under the cornice
        const sh = g.createLinearGradient(0, 0, 0, h * 0.18); sh.addColorStop(0, "rgba(0,0,0,.35)"); sh.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = sh; g.fillRect(0, 0, w, h * 0.18);
        // dado: dark wood panels
        const top = h * 0.68;
        g.fillStyle = "#3a281c"; g.fillRect(0, top, w, h - top);
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = "#4b3424"; g.fillRect(x + 6, top + 14, 52, h - top - 26);
          g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 2; g.strokeRect(x + 6, top + 14, 52, h - top - 26);
          g.strokeStyle = "rgba(255,220,160,.12)"; g.strokeRect(x + 10, top + 18, 44, h - top - 34);
        }
        // chair rail and skirting
        g.fillStyle = "#cfae6a"; g.fillRect(0, top - 3, w, 7);
        g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, top - 3, w, 1.5);
        g.fillStyle = "#241811"; g.fillRect(0, h - 12, w, 12);
        g.fillStyle = "#cfae6a"; g.fillRect(0, h - 13, w, 2);
      }, true);
    }
    woodTexture(base = "#6e4d34", planks = 5) {
      return this.canvasTex(128, 128, (g, w, h) => {
        const rnd = this.rng(planks * 977);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < planks; i++) {
          const y = (i * h) / planks;
          g.fillStyle = `rgba(${rnd() > 0.5 ? "255,220,170" : "0,0,0"},${0.05 + rnd() * 0.08})`; g.fillRect(0, y, w, h / planks);
          g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
          g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 1;
          for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, y + 4 + rnd() * (h / planks - 8)); g.bezierCurveTo(w * 0.3, y + rnd() * 10, w * 0.7, y + rnd() * 10, w, y + 4 + rnd() * (h / planks - 8)); g.stroke(); }
        }
      }, true);
    }
    floorTexture(room){
      return this.canvasTex(512,512,(g,w,h)=>{
        const service=['security','workshop','service'].includes(room.id),rnd=this.rng(room.x*7+room.y),light=service?'#89958d':'#cec6b3',dark=service?'#71817c':'#b9b3a2';
        for(let x=0;x<w;x+=128)for(let y=0;y<h;y+=128){g.fillStyle=(x+y)%256?light:dark;g.fillRect(x,y,128,128);g.strokeStyle='rgba(49,55,48,.2)';g.lineWidth=1;g.strokeRect(x,y,128,128);g.strokeStyle='rgba(246,240,220,.25)';for(let k=0;k<4;k++){g.beginPath();g.moveTo(x+rnd()*128,y);g.bezierCurveTo(x+rnd()*128,y+40,x+rnd()*128,y+90,x+rnd()*128,y+128);g.stroke();}}
        const carpets={lobby:'#20464b',gallery:'#583244',vault:'#243b42',security:'#213c47',workshop:'#50362c',service:'#31493f'};
        g.fillStyle=carpets[room.id]||'#203c40';g.fillRect(108,150,296,212);
        for(const inset of [8,16]){g.strokeStyle=inset===8?'#c1a66c':'#bca16d70';g.lineWidth=inset===8?3:1;g.strokeRect(108+inset,150+inset,296-inset*2,212-inset*2);}
        g.strokeStyle='#cbb87955';g.lineWidth=2;g.beginPath();g.ellipse(256,256,48,59,0,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(256,220);g.lineTo(278,256);g.lineTo(256,292);g.lineTo(234,256);g.closePath();g.stroke();
        for(let i=0;i<1200;i++){g.fillStyle=rnd()>.5?'#f8e5bb08':'#00000008';g.fillRect(108+rnd()*296,150+rnd()*212,2,2);}
        g.strokeStyle='#a28c5d';g.lineWidth=3;g.strokeRect(14,14,484,484);g.strokeStyle='#e9dcbd';g.lineWidth=1;g.strokeRect(20,20,472,472);
      });
    }
    hazardTexture() {
      return this.canvasTex(64, 64, (g, w, h) => {
        g.fillStyle = "#f2c230"; g.fillRect(0, 0, w, h); g.fillStyle = "#1a1a1a";
        for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + h, h); g.lineTo(i + h, h); g.closePath(); g.fill(); }
      }, true);
    }
    monitorTexture(index) {
      return this.canvasTex(256, 160, (g, w, h) => {
        g.fillStyle = "#04161a"; g.fillRect(0, 0, w, h);
        const rnd = this.rng(index * 131 + 5);
        g.strokeStyle = "#2f8f80"; g.lineWidth = 2;
        for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rnd() * w, 0); g.lineTo(rnd() * w, h); g.stroke(); }
        g.fillStyle = "rgba(120,255,220,.16)"; g.fillRect(20, 24, w - 40, h - 48);
        g.fillStyle = "#58f0c8"; g.fillRect(24, 28, 60, 6);
        g.fillStyle = "#ff4a5e"; g.beginPath(); g.arc(w - 26, 24, 6, 0, 7); g.fill();
        g.fillStyle = "rgba(0,0,0,.28)"; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
      });
    }
    crateTexture() {
      return this.canvasTex(128, 96, (g, w, h) => {
        const rnd = this.rng(31);
        g.fillStyle = "#7a5636"; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) { const y = (i * h) / 6; g.fillStyle = `rgba(${rnd() > 0.5 ? "255,225,180" : "0,0,0"},${0.06 + rnd() * 0.07})`; g.fillRect(0, y, w, h / 6); g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.fillStyle = "#4a4f55"; g.fillRect(8, 0, 10, h); g.fillRect(w - 18, 0, 10, h);
        g.fillStyle = "#cdd3d8"; for (const y of [10, h - 10]) for (const x of [13, w - 13]) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }
        g.fillStyle = "rgba(255,255,255,.82)"; g.fillRect(40, 30, 48, 34); g.fillStyle = "#222"; g.font = "800 13px Inter, sans-serif"; g.textAlign = "center"; g.fillText("FRAGILE", 64, 52);
      });
    }

    /* ---------- the building ---------- */
    mat(color, o = {}) {
      return new this.T.MeshStandardMaterial({ color, roughness: .72, metalness:0, ...o });
    }
    box(w, h, d, material, x, y, z, parent = this.scene) {
      const m = new this.T.Mesh(new this.T.BoxGeometry(w, h, d), material);
      m.position.set(x, y + h / 2, z);
      parent.add(m);
      return m;
    }
    // world rectangle to a box standing on the floor; the wallpaper repeats every four units
    wall(x1, y1, x2, y2, height, material, parent = this.tallG, base = 0) {
      if (x2 - x1 < 0.5 || y2 - y1 < 0.5) return null;
      const w = (x2 - x1) * S, d = (y2 - y1) * S;
      const m = this.box(w, height * S, d, material, ((x1 + x2) / 2) * S, base * S, ((y1 + y2) / 2) * S, parent);
      const uv = m.geometry.attributes.uv, k = Math.max(w, d) / 4.2;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * k);
      return m;
    }
    // a framed painting on a wall; (x, z) in museum coordinates, facing the room
    hang(index, x, z, rotY, w = 5, h = 3.8, y = 4.6) {
      const T = this.T, art = this.paintingTexture(index), g = new T.Group(), gold = this.mat(0xc9a96a, { emissive: 0x2a2008 });
      g.position.set(x, y, z); g.rotation.y = rotY;
      const frame = new T.Mesh(new T.BoxGeometry(w + 0.5, h + 0.5, 0.22), gold); g.add(frame);
      const mount = new T.Mesh(new T.BoxGeometry(w + 0.18, h + 0.18, 0.24), this.mat(0x15100c)); g.add(mount);
      const pic = new T.Mesh(new T.PlaneGeometry(w, h), art ? new T.MeshStandardMaterial({ map: art, emissive: 0x3a2f20 }) : this.mat(0x2a2a2a));
      pic.position.z = 0.13; g.add(pic);
      (this.paintings||=[]).push({mesh:pic,index});
      const lamp = new T.Mesh(new T.BoxGeometry(w * 0.5, 0.12, 0.34), new T.MeshBasicMaterial({ color: 0xffe9b0 }));
      lamp.position.set(0, h / 2 + 0.55, 0.22); g.add(lamp);
      const arm = new T.Mesh(new T.BoxGeometry(0.08, 0.08, 0.3), gold); arm.position.set(0, h / 2 + 0.4, 0.12); g.add(arm);
      this.tallG.add(g);
      return g;
    }
    exhibitModel(id) {
      const T = this.T, g = new T.Group(), gold = new T.MeshStandardMaterial({ color: 0xe3bd5f, metalness:.75,roughness:.25 });
      const lathe = (pts, mat) => new T.Mesh(new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), 18), mat);
      if (id === "lobby") g.add(lathe([[0.05, 0], [0.32, 0.05], [0.28, 0.35], [0.5, 0.65], [0.38, 0.95], [0.18, 1.05], [0.28, 1.3], [0.2, 1.3]], new T.MeshStandardMaterial({ color: 0x3f7ea8, emissive: 0x0b2236 })));
      else if (id === "gallery") {
        g.add(lathe([[0.55, 0], [0.55, 0.28], [0.5, 0.3]], gold));
        for (let i = 0; i < 6; i++) { const c = new T.Mesh(new T.ConeGeometry(0.12, 0.55, 5), gold); const a = (i / 6) * Math.PI * 2; c.position.set(Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5); g.add(c); const gem = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), new T.MeshBasicMaterial({ color: [0xff4a6a, 0x4ac8ff, 0x7dff9a][i % 3] })); gem.position.set(Math.cos(a) * 0.5, 0.88, Math.sin(a) * 0.5); g.add(gem); }
      } else if (id === "vault") { const d = new T.Mesh(new T.OctahedronGeometry(0.55), new T.MeshStandardMaterial({ color: 0x9de8ff, emissive: 0x2a8fb0 })); d.position.y = 0.8; d.scale.y = 1.35; g.add(d); }
      else if (id === "security") g.add(lathe([[0.01, 0], [0.34, 0], [0.3, 0.1], [0.08, 0.2], [0.08, 0.55], [0.5, 0.95], [0.5, 1.25], [0.44, 1.25], [0.42, 0.98], [0.02, 0.62]], gold));
      else if (id === "workshop") { const ring = new T.Mesh(new T.TorusGeometry(0.42, 0.14, 8, 18), new T.MeshStandardMaterial({ color: 0xb9bec4 })); ring.position.y = 0.75; g.add(ring); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, tooth = new T.Mesh(new T.BoxGeometry(0.16, 0.2, 0.28), new T.MeshStandardMaterial({ color: 0xb9bec4 })); tooth.position.set(Math.cos(a) * 0.56, 0.75 + Math.sin(a) * 0.56, 0); tooth.rotation.z = a; g.add(tooth); } }
      else { const b = new T.Mesh(new T.BoxGeometry(0.95, 0.5, 0.6), this.mat(0x6a4a2f)); b.position.y = 0.25; g.add(b); const lid = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.95, 12, 1, false, 0, Math.PI), this.mat(0x6a4a2f)); lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.y = 0.5; g.add(lid); const band = new T.Mesh(new T.BoxGeometry(1, 0.08, 0.64), gold); band.position.y = 0.5; g.add(band); }
      return g;
    }
    build() {
      const T = this.T, scene = this.scene;
      // walls and wall decorations are full height for first person; the overview squashes them so they never hide anyone
      this.tallG = new T.Group(); this.frontG = new T.Group(); this.ceilG = new T.Group();
      scene.add(this.tallG, this.frontG, this.ceilG);
      const gold = this.mat(0xc9a96a, { metalness:.72,roughness:.28 }), marble = this.mat(0xd9d3c8,{roughness:.32}), woodTex = this.woodTexture(), wood = new T.MeshStandardMaterial({ map: woodTex });
      const hall = { id: "hall", color: "#3a4650" }, hallMat = new T.MeshStandardMaterial({ map: this.wallTexture(hall) });
      this.wallMats = Object.fromEntries(W.ROOMS.map((r) => [r.id, new T.MeshStandardMaterial({ map: this.wallTexture(r) })]));
      const ground = new T.Mesh(new T.PlaneGeometry(400, 300), this.mat(0x07121a));
      ground.rotation.x = -Math.PI / 2; ground.position.set(48, -0.05, 32); scene.add(ground);
      for (const r of W.ROOMS) {
        const plane = new T.Mesh(new T.PlaneGeometry(r.w * S, r.h * S), new T.MeshStandardMaterial({ map: this.floorTexture(r),roughness:.32,metalness:.12 }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.set((r.x + r.w / 2) * S, 0, (r.y + r.h / 2) * S);
        scene.add(plane);
      }
      const hallFloor = new T.MeshStandardMaterial({ color: 0x35454b });
      this.doorBars = new Map();
      for (const d of W.DOORS) {
        const plane = new T.Mesh(new T.PlaneGeometry(d.w * S, d.h * S), hallFloor);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set((d.x + d.w / 2) * S, 0.01, (d.y + d.h / 2) * S);
        scene.add(plane);
        // a locked door is a red field across the doorway
        const field = new T.Mesh(new T.BoxGeometry(d.w>d.h?.18:d.w*S, 6, d.w>d.h?d.h*S:.18), new T.MeshBasicMaterial({ color: 0xff5468, transparent: true, opacity: 0.38, depthWrite: false }));
        field.position.set((d.x + d.w / 2) * S, 3, (d.y + d.h / 2) * S);
        field.visible = false;
        scene.add(field);
        this.doorBars.set(d.id, field);
      }
      const TALL = 80, T4 = 8, F = this.frontG, LINTEL = 60;
      for (const r of W.ROOMS) {
        const x1 = r.x, x2 = r.x + r.w, y1 = r.y, y2 = r.y + r.h, wm = this.wallMats[r.id];
        const gaps = (side) => W.DOORS.filter((d) =>
          side === "n" ? d.y + d.h === y1 && d.x >= x1 && d.x + d.w <= x2 :
          side === "s" ? d.y === y2 && d.x >= x1 && d.x + d.w <= x2 :
          side === "w" ? d.x + d.w === x1 && d.y >= y1 && d.y + d.h <= y2 :
          d.x === x2 && d.y >= y1 && d.y + d.h <= y2).map((d) => (side === "n" || side === "s" ? [d.x, d.x + d.w] : [d.y, d.y + d.h])).sort((a, b) => a[0] - b[0]);
        const spans = (a, b, g) => { const out = []; let at = a; for (const [s, e] of g) { out.push([at, s]); at = e; } out.push([at, b]); return out; };
        for (const [a, b] of spans(x1, x2, gaps("n"))) this.wall(a - T4, y1 - T4, b + T4, y1, TALL, wm);
        for (const [a, b] of spans(x1, x2, gaps("s"))) this.wall(a - T4, y2, b + T4, y2 + T4, TALL, wm, F);
        for (const [a, b] of spans(y1, y2, gaps("w"))) this.wall(x1 - T4, a, x1, b, TALL, wm);
        for (const [a, b] of spans(y1, y2, gaps("e"))) this.wall(x2, a, x2 + T4, b, TALL, wm);
        // ceiling with a glowing cove all around and light panels
        const ceil = new T.Mesh(new T.PlaneGeometry(r.w * S, r.h * S), this.mat(0xbab7a4));
        ceil.rotation.x = Math.PI / 2; ceil.position.set((r.x + r.w / 2) * S, TALL * S, (r.y + r.h / 2) * S); this.ceilG.add(ceil);
        const cove = new T.MeshBasicMaterial({ color: 0xffdfa0 }), cy = TALL * S - 0.25;
        this.box(r.w * S, 0.14, 0.3, cove, (r.x + r.w / 2) * S, cy, (y1 + 1.8) * S, this.ceilG);
        this.box(r.w * S, 0.14, 0.3, cove, (r.x + r.w / 2) * S, cy, (y2 - 1.8) * S, this.ceilG);
        this.box(0.3, 0.14, r.h * S, cove, (x1 + 1.8) * S, cy, (r.y + r.h / 2) * S, this.ceilG);
        this.box(0.3, 0.14, r.h * S, cove, (x2 - 1.8) * S, cy, (r.y + r.h / 2) * S, this.ceilG);
        if (r.id === "lobby" || r.id === "gallery" || r.id === "vault") this.chandelier((r.x + r.w / 2) * S, (r.y + r.h / 2 - 10) * S);
        else for (const dx of [0.3, 0.7]) this.industrialLight((r.x + r.w * dx) * S, (r.y + r.h / 2) * S);
        // paintings: two on the back wall, one on a side wall
        const L = LOT[r.id];
        this.hang(L, (r.x + 70) * S, (r.y + 0.6) * S, 0);
        this.hang((L + 3) % 8, (r.x + 188) * S, (r.y + 0.6) * S, 0, 4.2, 3.2, 5.0);
        this.sideDecor(r);
        this.architecture(r);
        const name = this.label(((window.GameI18n?.t(r.name)) || r.name).toUpperCase(), "#e4d29a", 22, false);
        name.position.set((r.x + r.w / 2) * S, 7.1, (r.y + 4) * S); this.tallG.add(name);
        // the display case: marble plinth, brass-edged glass, and the exhibit on a cushion
        const c = point(r.x + 188, r.y + 54);
        this.box(56 * S, 7 * S, 44 * S, marble, c.x * S, 0, c.y * S);
        this.box(58 * S, 1.2 * S, 46 * S, gold, c.x * S, 7 * S, c.y * S);
        const glassGeo = new T.BoxGeometry(50 * S, 20 * S, 38 * S), glass = new T.Mesh(glassGeo, new T.MeshPhysicalMaterial({ color:0xbfe6f2,roughness:.08,metalness:.05,transparent:true,opacity:.09,depthWrite:false,side:T.DoubleSide }));
        glass.position.set(c.x * S, 8.2 * S + 1, c.y * S); scene.add(glass);
        const edges = new T.LineSegments(new T.EdgesGeometry(glassGeo), new T.LineBasicMaterial({ color: 0xe6c77a }));
        edges.position.copy(glass.position); scene.add(edges);
        const pad = this.box(34 * S, 1.5 * S, 26 * S, this.mat(0x7a1f33), c.x * S, 8.2 * S, c.y * S);
        const ex = this.exhibitModel(r.id); ex.position.set(c.x * S, 8.2 * S + 0.15, c.y * S); ex.scale.setScalar(0.9); scene.add(ex);
        (this.exhibits ||= []).push(ex); void pad;
        // the bench: padded leather seat on gold feet
        const bench = point(r.x + 190, r.y + 196);
        this.box(70 * S, 2.5 * S, 20 * S, this.mat(0x4a1f24), bench.x * S, 4 * S, bench.y * S);
        this.box(68 * S, 1.2 * S, 18 * S, gold, bench.x * S, 3 * S, bench.y * S);
        for (const dx of [-30, 30]) for (const dz of [-7, 7]) this.box(2.4 * S, 3 * S, 2.4 * S, gold, (bench.x + dx) * S, 0, (bench.y + dz) * S);
      }
      // lintels, frames and brass posts around every doorway
      for (const d of W.DOORS) {
        const horiz = d.w > d.h, post = (x1, y1, x2, y2) => this.wall(x1, y1, x2, y2, LINTEL, gold);
        if (horiz) {
          for (const x of [d.x, d.x + d.w - T4]) { this.wall(x, d.y, x + T4, d.y + d.h, TALL - LINTEL, hallMat, this.tallG, LINTEL); post(x, d.y - 1.5, x + T4, d.y); post(x, d.y + d.h, x + T4, d.y + d.h + 1.5); }
          this.wall(d.x, d.y - T4, d.x + d.w, d.y, TALL, hallMat);
          this.wall(d.x, d.y + d.h, d.x + d.w, d.y + d.h + T4, TALL, hallMat, F);
        } else {
          for (const y of [d.y, d.y + d.h - T4]) { this.wall(d.x, y, d.x + d.w, y + T4, TALL - LINTEL, hallMat, this.tallG, LINTEL); post(d.x - 1.5, y, d.x, y + T4); post(d.x + d.w, y, d.x + d.w + 1.5, y + T4); }
          this.wall(d.x - T4, d.y, d.x, d.y + d.h, TALL, hallMat);
          this.wall(d.x + d.w, d.y, d.x + d.w + T4, d.y + d.h, TALL, hallMat);
        }
        const cc = new T.Mesh(new T.PlaneGeometry(d.w * S, d.h * S), this.mat(0xbab7a4)); cc.rotation.x = Math.PI / 2; cc.position.set((d.x + d.w / 2) * S, TALL * S, (d.y + d.h / 2) * S); this.ceilG.add(cc);
        const strip = new T.Mesh(new T.PlaneGeometry(Math.min(d.w, 40) * S * 0.6, 0.5), new T.MeshBasicMaterial({ color: 0xcfe7ff })); strip.rotation.x = Math.PI / 2; strip.position.set((d.x + d.w / 2) * S, TALL * S - 0.02, (d.y + d.h / 2) * S); this.ceilG.add(strip);
      }
      // job consoles: desk, keyboard, angled screen with a bezel and status lights
      this.consoles = W.STATIONS.map((s) => {
        const g = new T.Group(); g.position.set(s.x * S, 0, (s.y - 16) * S);
        this.box(1.9, 1.1, 1.3, this.mat(0x213038), 0, 0, 0, g);
        const screenMat = new T.MeshBasicMaterial({ map: this.screenTexture(s.kind), color: 0x9fb8b0 });
        const screen = new T.Mesh(new T.PlaneGeometry(1.5, 0.95), screenMat);
        screen.position.set(0, 1.75, 0.2); screen.rotation.x = -0.3; g.add(screen);
        const bezel = this.box(1.7, 1.15, 0.12, this.mat(0x0d151a), 0, 1.15, 0.08, g); bezel.rotation.x = -0.3; bezel.position.y = 1.7;
        this.box(0.5, 0.9, 0.35, this.mat(0x2a3a40), 0, 1.1, -0.1, g);
        const kb = this.box(1.3, 0.06, 0.4, this.mat(0x10181c), 0, 1.1, 0.35, g);
        for (let i = 0; i < 3; i++) { const led = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), new T.MeshBasicMaterial({ color: [0x58f0a8, 0xffd05a, 0xff6a7a][i] })); led.position.set(-0.7 + i * 0.18, 0.95, 0.66); g.add(led); }
        void kb; scene.add(g);
        return { s, group: g, screenMat };
      });
      // statues: stepped plinth with a brass plate, robed figure, raised arm and a laurel
      this.statues = W.JOINTS.map((j) => {
        const g = new T.Group(); g.position.set(j.x * S, 0, (j.y - 18) * S);
        const stone = new T.MeshStandardMaterial({ color: 0xd9d2c6, emissive: 0x1c1a16 });
        this.box(2.8, 0.5, 2.8, stone, 0, 0, 0, g); this.box(2.3, 0.6, 2.3, stone, 0, 0.5, 0, g);
        const plate = this.box(1.0, 0.3, 0.06, gold, 0, 0.55, 1.18, g); void plate;
        const robe = new T.Mesh(new T.LatheGeometry([[0.9, 0], [0.8, 1.2], [0.55, 2.4], [0.45, 3.1], [0.3, 3.3]].map(([x, y]) => new T.Vector2(x, y)), 16), stone); robe.position.y = 1.1; g.add(robe);
        const head = new T.Mesh(new T.SphereGeometry(0.5, 16, 12), stone); head.position.y = 4.7; g.add(head);
        const neck = new T.Mesh(new T.CylinderGeometry(0.2, 0.28, 0.5, 10), stone); neck.position.y = 4.2; g.add(neck);
        const arm = new T.Mesh(new T.CapsuleGeometry(0.17, 1.5, 4, 8), stone); arm.position.set(0.85, 4.2, 0); arm.rotation.z = -0.5; g.add(arm);
        const laurel = new T.Mesh(new T.TorusGeometry(0.5, 0.06, 6, 20), gold); laurel.position.y = 4.95; laurel.rotation.x = Math.PI / 2; g.add(laurel);
        scene.add(g);
        return { j, group: g };
      });
      // crates: slatted wood with metal straps; the one in the Service Hall is the exit
      const crateTex = this.crateTexture(), crate = new T.MeshStandardMaterial({ map: crateTex });
      W.TRANSPORT.forEach((t) => {
        const m = this.box(2.2, 1.7, 1.8, crate, t.x * S, 0, (t.y - 14) * S);
        void m;
        this.box(2.3, 0.14, 1.9, this.mat(0x4a4f55), t.x * S, 1.7, (t.y - 14) * S);
        if (t.room === "service") {
          const sign = this.label("SERVICE EXIT", "#9cf0c3", 22, false); sign.position.set(t.x * S, 3.6, (t.y - 14) * S); scene.add(sign);
          const arrow = new T.Mesh(new T.ConeGeometry(0.4, 0.8, 4), new T.MeshBasicMaterial({ color: 0x7dffb4 })); arrow.position.set(t.x * S, 2.7, (t.y - 14) * S); arrow.rotation.x = Math.PI; scene.add(arrow);
        }
      });
      // the CCTV wall: a long desk under three bright monitors
      const cv = new T.Group(); cv.position.set(W.CCTV.x * S, 0, (W.CCTV.y - 15) * S);
      this.box(3.6, 1.1, 1.3, this.mat(0x213038), 0, 0, 0, cv);
      this.cctvScreens = [-1.15, 0, 1.15].map((dx, i) => {
        const m = new T.MeshBasicMaterial({ map: this.monitorTexture(i), color: 0xcfeee6 });
        const sc = new T.Mesh(new T.PlaneGeometry(1.0, 0.8), m); sc.position.set(dx, 1.95, 0.18); sc.rotation.x = -0.25; cv.add(sc);
        const bz = this.box(1.15, 0.95, 0.1, this.mat(0x0d151a), dx, 1.45, 0.08, cv); bz.rotation.x = -0.25; bz.position.y = 1.95;
        return m;
      });
      this.box(3.4, 0.7, 0.2, this.mat(0x2a3a40), 0, 1.1, -0.35, cv);
      const cvl = this.label("CCTV", "#bfe8d6", 20, false); cvl.position.y = 3.6; cv.add(cvl);
      scene.add(cv);
      // the emergency button: hazard-striped base, glass dome, red button
      const eb = new T.Group(); eb.position.set(W.EMERGENCY.x * S, 0, (W.EMERGENCY.y - 15) * S);
      this.box(1.7, 1.0, 1.3, this.mat(0x2a3a40), 0, 0, 0, eb);
      const hz = this.hazardTexture(); hz.repeat.set(2, 1);
      const ring = new T.Mesh(new T.CylinderGeometry(0.72, 0.8, 0.22, 24), new T.MeshStandardMaterial({ map: hz })); ring.position.y = 1.12; eb.add(ring);
      this.emergencyCap = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 0.35, 20), new T.MeshBasicMaterial({ color: 0xff3b54 }));
      this.emergencyCap.position.y = 1.4; eb.add(this.emergencyCap);
      const dome = new T.Mesh(new T.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.22, depthWrite: false }));
      dome.position.y = 1.22; eb.add(dome);
      const ebl = this.label("EMERGENCY", "#ff8c9c", 20, false); ebl.position.y = 3.2; eb.add(ebl);
      scene.add(eb);
      this.markers();
      this.atmosphere();
    }
    chandelier(x, z) {
      const T = this.T, g = new T.Group(), gold = this.mat(0xe3bd5f, { metalness:.75,roughness:.25 });
      g.position.set(x, 8, z);
      const chain = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.2, 6), gold); chain.position.y = -0.6; g.add(chain);
      for (const [r, y] of [[1.5, -1.3], [0.9, -1.0]]) {
        const ring = new T.Mesh(new T.TorusGeometry(r, 0.07, 8, 28), gold); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, b = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), new T.MeshBasicMaterial({ color: 0xfff1c4 })); b.position.set(Math.cos(a) * r, y + 0.12, Math.sin(a) * r); g.add(b); }
      }
      this.ceilG.add(g);
    }
    industrialLight(x, z) {
      const T = this.T, g = new T.Group(); g.position.set(x, 8, z);
      const housing = new T.Mesh(new T.BoxGeometry(2.6, 0.15, 0.5), this.mat(0x2a3238)); housing.position.y = -0.1; g.add(housing);
      const tube = new T.Mesh(new T.BoxGeometry(2.4, 0.08, 0.3), new T.MeshBasicMaterial({ color: 0xeaf6ff })); tube.position.y = -0.2; g.add(tube);
      this.ceilG.add(g);
    }
    // each room's side-wall feature
    sideDecor(r) {
      const T = this.T, x1 = r.x * S, x2 = (r.x + r.w) * S, z = (r.y + 180) * S, gold = this.mat(0xc9a96a, { emissive: 0x2a2008 });
      if (r.id === "vault") {
        const g = new T.Group(); g.position.set(x2 - 0.25, 3.6, (r.y + 110) * S); g.rotation.y = -Math.PI / 2;
        const disc = new T.Mesh(new T.CylinderGeometry(3, 3, 0.5, 32), this.mat(0x6c7479)); disc.rotation.x = Math.PI / 2; g.add(disc);
        for (const rad of [2.5, 1.7, 0.7]) { const ring = new T.Mesh(new T.TorusGeometry(rad, 0.08, 8, 32), gold); ring.position.z = 0.28; g.add(ring); }
        for (let i = 0; i < 6; i++) { const sp = new T.Mesh(new T.BoxGeometry(0.2, 3.4, 0.2), this.mat(0x9aa2a8)); sp.rotation.z = (i / 6) * Math.PI; sp.position.z = 0.3; g.add(sp); }
        this.tallG.add(g);
      } else if (r.id === "security") {
        for (let i = 0; i < 3; i++) { const m = new T.Mesh(new T.PlaneGeometry(2.4, 1.5), new T.MeshBasicMaterial({ map: this.monitorTexture(i + 3) })); m.position.set(x1 + 0.2, 4.3, (r.y + 150 + i * 28) * S); m.rotation.y = Math.PI / 2; this.tallG.add(m); const bz = this.box(0.1, 1.7, 2.6, this.mat(0x0d151a), x1 + 0.1, 3.45, (r.y + 150 + i * 28) * S, this.tallG); void bz; }
      } else if (r.id === "workshop") {
        const board = this.box(0.12, 3.2, 6, this.mat(0x6d5a43), x1 + 0.08, 3, z, this.tallG);
        for (let i = 0; i < 5; i++) { const tool = this.box(0.2, 1.5 - (i % 2) * 0.4, 0.2, this.mat(i % 2 ? 0xb9bec4 : 0xc7703a), x1 + 0.2, 3.4, z + (i - 2) * 1.1, this.tallG); void tool; }
        void board;
      } else if (r.id === "service") {
        const hz = this.hazardTexture(); hz.repeat.set(8, 1);
        const band = new T.Mesh(new T.PlaneGeometry(6, 0.5), new T.MeshStandardMaterial({ map: hz })); band.position.set(x2 - 0.2, 0.6, z); band.rotation.y = -Math.PI / 2; this.tallG.add(band);
        const sign = this.label("STAFF ONLY", "#ffd36a", 22, false); sign.position.set(x2 - 0.4, 4.2, z); this.tallG.add(sign);
      } else if (r.id === "lobby") {
        const face = new T.Mesh(new T.CircleGeometry(1.5, 32), new T.MeshBasicMaterial({ color: 0xf3ead2 })); face.position.set(x1 + 0.2, 5.2, z); face.rotation.y = Math.PI / 2; this.tallG.add(face);
        const rim = new T.Mesh(new T.TorusGeometry(1.5, 0.12, 8, 32), gold); rim.position.copy(face.position); rim.rotation.y = Math.PI / 2; this.tallG.add(rim);
        this.clockHands = [0.9, 1.25].map((len) => { const h = new T.Mesh(new T.BoxGeometry(0.06, len, 0.05), this.mat(0x1d1a16)); const piv = new T.Group(); piv.position.copy(face.position); piv.position.x += 0.1; piv.rotation.y = Math.PI / 2; h.position.y = len / 2; piv.add(h); this.tallG.add(piv); return piv; });
      } else this.hang((LOT[r.id] + 5) % 8, x1 + 0.2, z, Math.PI / 2, 4.2, 3.2, 4.6);
    }
    // drifting dust in the light
    atmosphere() {
      const T = this.T, n = 140, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3), rnd = this.rng(99);
      for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 22; pos[i * 3 + 1] = rnd() * 8; pos[i * 3 + 2] = (rnd() - 0.5) * 22; }
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.dust = new T.Points(geo, new T.PointsMaterial({ color: 0xfff1cf, size: 0.07, transparent: true, opacity: 0.5, depthWrite: false }));
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
      this.fog = new T.Fog(0x060f15, 26, 80); this.scene.fog = this.fp ? this.fog : null;
    }
    paintingTexture(index){
      if(!galleryArt.complete||!galleryArt.naturalWidth)return this.lotTexture(index);
      this.paintTex||=new Map();const key=index%4;
      if(!this.paintTex.has(key)){const c=document.createElement('canvas');c.width=c.height=384;const sw=galleryArt.naturalWidth/2,sh=galleryArt.naturalHeight/2;c.getContext('2d').drawImage(galleryArt,(key%2)*sw,Math.floor(key/2)*sh,sw,sh,0,0,384,384);this.paintTex.set(key,this.tex(c));}
      return this.paintTex.get(key);
    }
    lotTexture(index) {
      if (!lots.complete || !lots.naturalWidth || index == null) return null;
      this.lotTex ||= new Map();
      if (!this.lotTex.has(index)) {
        const sw = lots.naturalWidth / 4, sh = lots.naturalHeight / 2, c = document.createElement("canvas");
        c.width = 256; c.height = 200;
        c.getContext("2d").drawImage(lots, (index % 4) * sw, Math.floor(index / 4) * sh, sw, sh, 0, 0, 256, 200);
        this.lotTex.set(index, this.tex(c));
      }
      return this.lotTex.get(index);
    }
    screenTexture(kind) {
      const c = document.createElement("canvas"), g = c.getContext("2d");
      c.width = 256; c.height = 160;
      g.fillStyle = "#0c2a2c"; g.fillRect(0, 0, 256, 160);
      g.strokeStyle = "#5fa694"; g.lineWidth = 4; g.strokeRect(6, 6, 244, 148);
      g.fillStyle = "#a3ecc6"; g.font = "800 70px Inter, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText({ wires: "≋", circuit: "⌬", scan: "◎", memory: "◈" }[kind] || "!", 128, 84);
      return this.tex(c);
    }
    // the glowing job and delivery markers, drawn each frame from your private job list
    markers() {
      const T = this.T;
      this.beacons = new Map();
      this.deliver = new T.Group();
      const ring = new T.Mesh(new T.TorusGeometry(1.6, 0.12, 8, 32), new T.MeshBasicMaterial({ color: 0x9cf0c3 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; this.deliver.add(ring);
      const text = this.label("DELIVER", "#a1efcf", 22); text.position.y = 3; this.deliver.add(text);
      this.deliver.visible = false; this.scene.add(this.deliver);
      this.ping = new T.Mesh(new T.RingGeometry(0.5, 0.7, 28), new T.MeshBasicMaterial({ color: 0xf2dfa3, transparent: true, side: T.DoubleSide }));
      this.ping.rotation.x = -Math.PI / 2; this.ping.visible = false; this.scene.add(this.ping);
    }
    beacon(job, color) {
      let b = this.beacons.get(job.id);
      if (b) return b;
      const T = this.T, g = new T.Group();
      const ring = new T.Mesh(new T.TorusGeometry(1.1, 0.1, 8, 28), new T.MeshBasicMaterial({ color }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
      const beam = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 7, 12, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide }));
      beam.position.y = 3; g.add(beam);
      const name = this.label(job.name || "Job", "#f6e3a8", 20, false); name.scale.multiplyScalar(.7);name.position.y = 3.4; g.add(name);
      g.position.set(job.x * S, 0, job.y * S);
      this.scene.add(g);
      b = { g, ring, beam, name, seen: true };
      this.beacons.set(job.id, b);
      return b;
    }

    /* ---------- people ---------- */
    character(person) {
      const T=this.T,i=person?.avatarIndex||0,g=new T.Group(),mats=[];
      const female=i%2===0,dress=female&&i!==0,skin=SKINS[i],grey=[3,4,7,8].includes(i),hairColor=grey?0xb9b6ac:0x1b1415;
      const material=(color,roughness=.65,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness});mats.push(m);return m;};
      const jacket=material(COLORS[i]),skinMat=material(skin,.8),hair=material(hairColor,.9),dark=material(0x18212a),ivory=material(0xf2eadb),gold=material(0xdab778,.28,.7);
      const mesh=(geo,mat,x,y,z,parent=g)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true;parent.add(m);return m;};
      const sphere=(mat,x,y,z,sx,sy,sz,parent=g)=>{const m=mesh(new T.SphereGeometry(1,16,12),mat,x,y,z,parent);m.scale.set(sx,sy,sz);return m;};
      const body=mesh(new T.CapsuleGeometry(.49,.72,6,16),jacket,0,1.85,0);body.scale.z=.7;
      sphere(jacket,0,2.32,0,.72,.24,.37);
      if(dress){mesh(new T.CylinderGeometry(.40,.63,1.0,16),jacket,0,1.1,0);mesh(new T.SphereGeometry(.09,10,8),gold,0,2.31,.37);}
      else {
        mesh(new T.BoxGeometry(.35,.79,.04),ivory,0,2.0,.37);
        for(const side of [-1,1]){const lapel=mesh(new T.BoxGeometry(.21,.65,.055),jacket,side*.25,2.13,.4);lapel.rotation.z=side*-.33;}
        const bow=mesh(new T.SphereGeometry(.14,8,6),dark,0,2.36,.43);bow.scale.set(1.5,.6,.5);
        for(const y of [1.9,1.65])mesh(new T.SphereGeometry(.035,8,6),gold,.13,y,.37);
      }
      mesh(new T.CylinderGeometry(.15,.17,.3,12),skinMat,0,2.65,0);
      const legs=[-1,1].map(side=>{const hip=new T.Group();hip.position.set(side*.26,1.25,0);g.add(hip);mesh(new T.CapsuleGeometry(.16,.73,4,10),dark,0,-.5,0,hip);const shoe=mesh(new T.SphereGeometry(1,12,8),dark,0,-1.13,.1,hip);shoe.scale.set(.21,.12,.35);return hip;});
      const arms=[-1,1].map(side=>{const arm=new T.Group();arm.position.set(side*.68,2.3,0);arm.rotation.z=side*.06;g.add(arm);mesh(new T.CapsuleGeometry(.16,.61,5,12),jacket,0,-.41,0,arm);mesh(new T.CylinderGeometry(.14,.14,.09,10),ivory,0,-.84,0,arm);sphere(skinMat,0,-1.0,.015,.14,.2,.13,arm);return arm;});
      const head=mesh(new T.SphereGeometry(1,24,18),skinMat,0,3.23,.02);head.scale.set(.5,.63,.45);head.castShadow=body.castShadow=true;
      sphere(skinMat,-.5,3.22,0,.1,.16,.09);sphere(skinMat,.5,3.22,0,.1,.16,.09);
      // Sculpted hair, eyes and expressions turn with the character; no flat portrait pasted on top.
      if(i!==11){const cap=mesh(new T.SphereGeometry(.53,20,14,0,Math.PI*2,0,Math.PI*.56),hair,0,3.39,-.01);cap.scale.set(1,1.06,.94);
        for(let k=0;k<5;k++){const lock=sphere(hair,-.35+k*.16,3.65+Math.sin(k)*.025,.29,.16,.14,.14);lock.rotation.z=(k-2)*.15;}
        if(female){sphere(hair,0,3.25,-.25,.55,.6,.32);if([6,10].includes(i))sphere(hair,0,3.7,-.45,.29,.28,.26);else for(const side of [-1,1])sphere(hair,side*.48,3.17,-.03,.13,i===2?.65:.4,.23);}
      }
      const eyes=new T.Group();g.add(eyes);
      for(const side of [-1,1]){
        sphere(ivory,side*.19,3.3,.425,.115,.074,.04,eyes);
        sphere(dark,side*.19,3.3,.46,.048,.057,.024,eyes);
        sphere(ivory,side*.18-.012,3.32,.481,.014,.017,.009,eyes);
        const brow=mesh(new T.CapsuleGeometry(.025,.17,3,8),hair,side*.19,3.45,.435);brow.rotation.z=Math.PI/2+side*.10;
        if(female)sphere(gold,side*.54,3.02,.02,.044,.07,.04);
      }
      sphere(skinMat,0,3.17,.46,.07,.105,.08);
      const smilePoints=[new T.Vector3(-.13,3.04,.423),new T.Vector3(0,3.01,.453),new T.Vector3(.13,3.04,.423)];
      const mouth=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(smilePoints),12,.016,5,false),material(female?0x9e4145:0x7a4940),0,0,0);
      if(i===3)for(const side of [-1,1]){const rim=mesh(new T.TorusGeometry(.14,.014,6,18),gold,side*.19,3.3,.49);rim.scale.y=.85;}
      if([1,7,11].includes(i))sphere(hair,0,2.83,.20,.26,.12,.23);
      const closedEyes=new T.Group();closedEyes.visible=false;g.add(closedEyes);for(const side of [-1,1]){const line=mesh(new T.CapsuleGeometry(.014,.15,3,6),dark,side*.19,3.3,.47,closedEyes);line.rotation.z=Math.PI/2;}
      const shadow=new T.Mesh(new T.PlaneGeometry(2.3,2.3),new T.MeshBasicMaterial({map:this.contactTexture(),transparent:true,opacity:.6,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;g.add(shadow);
      const bag=new T.Group();bag.position.set(.88,.91,.15);bag.visible=false;g.add(bag);mesh(new T.BoxGeometry(.65,.49,.3),material(0x6f4931,.5),0,0,0,bag);const handle=mesh(new T.TorusGeometry(.17,.035,6,14,Math.PI),gold,0,.25,0,bag);
      const name=this.label(person?.name||'', '#f5ead2',20,false);name.position.y=4.22;name.scale.multiplyScalar(.62);g.add(name);
      this.scene.add(g);
      return {g,body,legs,arms,head,eyes,closedEyes,mouth,bag,name,shadow,mats,face:i,label:person?.name||'',facing:0,phase:Math.random()*6};
    }
    contactTexture(){
      if(this.contactTex)return this.contactTex;
      return this.contactTex=this.canvasTex(64,64,(g,w,h)=>{const a=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);a.addColorStop(0,'#000b');a.addColorStop(.5,'#0005');a.addColorStop(1,'#0000');g.fillStyle=a;g.fillRect(0,0,w,h);});
    }

    fade(p, o) {
      for (const m of p.mats) { m.transparent = o < 1; m.opacity = o; }
      p.head.material.opacity = o;
    }
    person(id, person) {
      let p = this.people.get(id);
      if (!p) { p = this.character(person); this.people.set(id, p); }
      if (p.label !== (person?.name || "")) { p.name.material.map = this.label(person?.name || "").material.map; p.label = person?.name || ""; }
      return p;
    }

    /* ---------- your own eyes ---------- */
    makeHands() {
      const T = this.T;
      this.hands = new T.Group();
      this.handMeshes = [-1, 1].map((side) => {
        const arm = new T.Group();
        const sleeve = new T.Mesh(new T.CapsuleGeometry(0.065, 0.32, 5, 12), new T.MeshBasicMaterial({ color: 0x344f9e }));
        sleeve.rotation.x = Math.PI / 2; sleeve.position.z = -0.05;
        const hand = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), new T.MeshBasicMaterial({ color: 0xd1a27c }));
        hand.position.z = -0.30; hand.scale.set(1, 0.8, 1.2);
        arm.add(sleeve, hand);
        arm.position.set(side * 0.42, -0.5, -0.75); arm.rotation.set(0.2, -side * 0.12, side * 0.06);
        arm.userData = { side, sleeve, hand };
        this.hands.add(arm);
        return arm;
      });
      this.heldBag = new T.Mesh(new T.BoxGeometry(0.55, 0.35, 0.4), new T.MeshStandardMaterial({ color: 0xa18450 }));
      this.heldBag.position.set(0, -0.42, -1.0); this.heldBag.visible = false; this.hands.add(this.heldBag);
      this.camera.add(this.hands);
    }
    viewControl() {
      const host = this.canvas.parentElement; if (!host) return;
      // a navigation card: a proper arrow, where it leads, and how far
      this.compassEl = document.createElement("div");
      this.compassEl.className = "heist-compass";
      this.compassEl.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 40 25H29.5V45h-11V25H8Z"/></svg><div><b></b><span></span></div>';
      this.compassEl.style.display = "none";
      host.append(this.compassEl);
    }
    applyView() {
      const fp = this.fp;
      this.tallG.scale.y = fp ? 1 : 26 / 80;
      this.frontG.scale.y = fp ? 1 : 5 / 80;
      this.ceilG.visible = fp;
      if (this.scene) this.scene.fog = fp ? this.fog : null;
      this.hands.visible = fp;
      this.camera.fov = fp ? 74 : 40; this.camera.near = fp ? 0.08 : 0.5;
      this.camera.rotation.order = "YXZ";
      this.camera.updateProjectionMatrix();
      this.canvas.dataset.view = fp ? "first" : "top";
      const hint = this.canvas.parentElement?.querySelector(".map-hint span");
      if (hint) hint.textContent = fp ? "ARROWS / WASD · DRAG TO LOOK" : "TAP TO WALK · ARROWS / WASD";
      if (this.compassEl && !fp) this.compassEl.style.display = "none";
      this.camPos?.set(this.me ? this.me.x * S : 8, 18, (this.me ? this.me.y * S : 8) + 24);
    }
    // the direction you are looking, in museum coordinates
    forward() { return point(-Math.sin(this.yaw), -Math.cos(this.yaw)); }
    pointOfView(s, t, dt, moved) {
      const cam = this.camera, me = this.me, f = this.forward();
      this.bob += dt * (moved > 8 ? 9 : 0);
      const bobY = moved > 8 ? Math.sin(this.bob) * 0.06 : 0;
      cam.position.set(me.x * S, 3.35 + bobY, me.y * S);
      cam.rotation.set(this.pitch, this.yaw, 0);
      // hands swing as you walk and hold the exhibit you carry
      const sw = moved > 8 ? Math.sin(this.bob) : 0, carry = !!s.me.bag;
      this.heldBag.visible = carry;
      this.handMeshes.forEach((arm) => {
        const side = arm.userData.side;
        arm.position.set(side * (carry ? 0.24 : 0.36), -0.65 + (moved > 8 ? Math.abs(Math.sin(this.bob)) * -0.04 : 0) + (carry ? 0.08 : 0), -0.7 - (carry ? 0.1 : 0));
        arm.rotation.x = 0.05 + sw * 0.07 * -side + (carry ? 0.2 : 0);
        arm.userData.hand.material.color.setHex(SKINS[s.players.find(q=>q.id===s.meId)?.avatarIndex||0]);
        arm.userData.sleeve.material.color.set(COLORS[(s.players.find((q) => q.id === s.meId)?.avatarIndex || 0) % COLORS.length]);
      });
      // an arrow on screen toward the place you chose
      const g = this.guideHeading;
      if (this.compassEl) {
        const show = this.fp && this.guideTo && W.distance(me, this.guideTo) >= 26 && g;
        this.compassEl.style.display = show ? "" : "none";
        if (show) {
          const d = point(g.x - me.x, g.y - me.y), right = point(Math.cos(this.yaw), -Math.sin(this.yaw)),
            ang = Math.atan2(d.x * right.x + d.y * right.y, d.x * f.x + d.y * f.y);
          this.compassEl.firstChild.style.transform = `rotate(${ang}rad)`;
          const path = this.guidePath, len = path ? path.slice(1).reduce((a, q, i) => a + W.distance(path[i], q), 0) : W.distance(me, this.guideTo);
          const [label, dist] = this.compassEl.querySelectorAll("b, span");
          label.textContent = this.guideTo.label || "Your job";
          dist.textContent = Math.max(1, Math.round(len / 10)) + " m" + (Math.abs(ang) > 2.2 ? " · behind you" : Math.abs(ang) < 0.35 ? " · straight ahead" : ang > 0 ? " · to your right" : " · to your left");
        }
      }
    }

    /* ---------- input ---------- */
    listen() {
      const keysOf = (e) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keydown = (e) => {
        if (document.querySelector("dialog[open]") || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const k = keysOf(e);
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(k)) { e.preventDefault(); this.keys.add(k); }
        if (k === "e" && !e.repeat) this.hooks.action();
        if (k === "r" && !e.repeat) this.hooks.report();
      };
      this.keyup = (e) => { this.keys.delete(keysOf(e)); };
      this.blur = () => this.keys.clear();
      this.pointer = (e) => (this.fp ? this.dragStart(e) : this.tap(e));
      this.drag = (e) => {
        if (!this.dragging || e.pointerId !== this.dragging.id) return;
        this.yaw -= (e.clientX - this.dragging.x) * 0.0065;
        this.pitch = Math.max(-0.7, Math.min(0.7, this.pitch - (e.clientY - this.dragging.y) * 0.005));
        this.dragging.x = e.clientX; this.dragging.y = e.clientY;
      };
      this.dragEnd = (e) => { if (this.dragging && e.pointerId === this.dragging.id) this.dragging = null; };
      this.canvas.addEventListener("pointermove", this.drag);
      this.canvas.addEventListener("pointerup", this.dragEnd);
      this.canvas.addEventListener("pointercancel", this.dragEnd);
      addEventListener("keydown", this.keydown);
      addEventListener("keyup", this.keyup);
      addEventListener("blur", this.blur);
      this.canvas.addEventListener("pointerdown", this.pointer);
    }
    // a round thumb stick for phones and tablets
    stickControl() {
      if (!matchMedia("(pointer: coarse)").matches) return;
      const host = this.canvas.parentElement; if (!host) return;
      const base = document.createElement("div"), knob = document.createElement("i");
      base.className = "heist-stick"; base.append(knob); host.append(base); this.stickEl = base;
      let id = null, o = null;
      const set = (e) => {
        const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 8;
        let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / max);
        dx = (dx / d) * k; dy = (dy / d) * k;
        knob.style.transform = `translate(${dx * max}px,${dy * max}px)`;
        this.stick = k < 0.18 ? { x: 0, y: 0 } : { x: dx, y: dy };
      };
      base.addEventListener("pointerdown", (e) => { id = e.pointerId; base.setPointerCapture(id); set(e); e.preventDefault(); });
      base.addEventListener("pointermove", (e) => { if (e.pointerId === id) set(e); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; this.stick = { x: 0, y: 0 }; knob.style.transform = ""; };
      base.addEventListener("pointerup", end); base.addEventListener("pointercancel", end); void o;
    }
    dragStart(e) {
      this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    }
    tap(e) {
      const s = this.hooks.state();
      if (!s || s.phase !== "live" || document.querySelector("dialog[open]")) return;
      const r = this.canvas.getBoundingClientRect(), T = this.T;
      const ndc = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.camera);
      const hit = new T.Vector3();
      if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), hit)) return;
      const p = point(hit.x / S, hit.z / S), closed = closedDoors(s);
      if (!W.walkable(p, closed)) return;
      const path = W.route(this.me || p, p, closed);
      if (!path) return;
      this.walk = path.slice(1);
      this.pingAt = { ...p, at: performance.now() };
      this.hooks.move(p);
    }

    /* ---------- the loop ---------- */
    loop() {
      if (this.destroyed || !this.renderer) return;
      this.raf = requestAnimationFrame(() => this.loop());
      const t = performance.now(), dt = Math.min(0.25, (t - this.last) / 1000);
      this.last = t;
      try { this.frame(t, dt); } catch (e) { console.warn("3D museum frame", e); }
    }
    serverPosition(s) {
      return W.position({ path: s.me.path, walkAt: s.me.walkAt, pos: s.me.position }, this.hooks.now());
    }
    input(dt) {
      const k = this.keys;
      if (this.fp) {
        const turn = (k.has("ArrowLeft") ? 1 : 0) - (k.has("ArrowRight") ? 1 : 0);
        this.yaw += turn * 2.1 * dt;
        const f = (k.has("ArrowUp") || k.has("w") ? 1 : 0) - (k.has("ArrowDown") || k.has("s") ? 1 : 0) - this.stick.y,
          st = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0) + this.stick.x,
          fw = this.forward(), rt = point(Math.cos(this.yaw), -Math.sin(this.yaw));
        let x = fw.x * f + rt.x * st, y = fw.y * f + rt.y * st;
        const m = Math.hypot(x, y);
        if (m < 0.05) return { x: 0, y: 0 };
        if (m > 1) { x /= m; y /= m; }
        return { x, y };
      }
      let x = (k.has("ArrowRight") || k.has("d") ? 1 : 0) - (k.has("ArrowLeft") || k.has("a") ? 1 : 0),
        y = (k.has("ArrowDown") || k.has("s") ? 1 : 0) - (k.has("ArrowUp") || k.has("w") ? 1 : 0);
      if (!x && !y) return { x: this.stick.x, y: this.stick.y };
      const d = Math.hypot(x, y); return { x: x / d, y: y / d };
    }
    // moves you by (dx, dy), sliding along walls
    slide(dx, dy, closed) {
      const me = this.me;
      if (fits({ x: me.x + dx, y: me.y + dy }, closed)) { me.x += dx; me.y += dy; return; }
      if (dx && fits({ x: me.x + dx, y: me.y }, closed)) me.x += dx;
      else if (dy && fits({ x: me.x, y: me.y + dy }, closed)) me.y += dy;
    }
    frame(t, dt) {
      const s = this.hooks.state(); if (!s || !this.renderer) return;
      const T = this.T, now = this.hooks.now(), closed = closedDoors(s), serverPos = this.serverPosition(s);
      if (!this.me) {
        this.me = point(serverPos.x, serverPos.y);
        const rm = W.roomAt(this.me) || W.ROOMS[0], dx = rm.x + rm.w / 2 - this.me.x, dy = rm.y + rm.h / 2 - this.me.y;
        this.yaw = Math.atan2(-dx, -dy); // start by looking into the room
      }
      // --- your own movement ---
      const live = s.phase === "live" && !document.querySelector("dialog[open]");
      const inp = live ? this.input(dt) : { x: 0, y: 0 };
      const moving = !!(inp.x || inp.y);
      const before = point(this.me.x, this.me.y);
      if (moving) {
        this.walk = null;
        // a slow frame (a phone) still covers the same ground, a few units at a time so walls hold
        const step = W.SPEED * dt, n = Math.max(1, Math.ceil(step / 3));
        for (let i = 0; i < n; i++) this.slide((inp.x * step) / n, (inp.y * step) / n, closed);
        this.facing = Math.atan2(inp.x, inp.y);
        this.wasMoving = true;
        if (t - this.syncAt > SYNC_MS) { this.syncAt = t; this.hooks.move(this.ahead(inp, closed)); }
      } else if (this.walk?.length) {
        let left = W.SPEED * dt;
        while (left > 0 && this.walk.length) {
          const to = this.walk[0], d = W.distance(this.me, to);
          if (d <= left) { this.me.x = to.x; this.me.y = to.y; left -= d; this.walk.shift(); }
          else { this.me.x += ((to.x - this.me.x) / d) * left; this.me.y += ((to.y - this.me.y) / d) * left; left = 0; }
        }
        const dir = point(this.me.x - before.x, this.me.y - before.y);
        if (dir.x || dir.y) this.facing = Math.atan2(dir.x, dir.y);
        if (!this.walk.length) this.walk = null;
      } else {
        if (this.wasMoving) { this.wasMoving = false; this.syncAt = t; this.hooks.move(point(this.me.x, this.me.y)); }
        // the server is the last word: once its walk has finished, settle where it put you
        const end = s.me.path.at(-1), gap = W.distance(serverPos, this.me);
        if (t - this.syncAt > 3000 && W.distance(serverPos, end) < 1 && gap > 60) { this.me.x += (serverPos.x - this.me.x) * Math.min(1, dt * 4); this.me.y += (serverPos.y - this.me.y) * Math.min(1, dt * 4); }
      }
      if (!moving && !this.walk && t - this.syncAt > 3000 && W.distance(serverPos, this.me) > 150) { this.me.x = serverPos.x; this.me.y = serverPos.y; this.walk = null; } // moved by the game (a meeting, a rescue)
      const moved = W.distance(before, this.me) / Math.max(dt, 0.001);
      // --- the scene ---
      this.light(s, now,dt);
      this.show(s, now, t, dt, { moved });
      this.follow(s, dt);
      if (this.fp) this.pointOfView(s, t, dt, moved);
      this.renderer.render(this.scene, this.camera);
    }
    // the point a little way ahead of you, for the server to walk to
    ahead(inp, closed) {
      let best = point(this.me.x, this.me.y);
      for (let d = 8; d <= LOOKAHEAD; d += 6) {
        const q = point(this.me.x + inp.x * d, this.me.y + inp.y * d);
        if (!fits(q, closed)) break;
        best = q;
      }
      return best;
    }
    light(s, now,dt=1/60) {
      const blend=1-Math.exp(-dt*7);
      const lights = s.sabotage?.kind === "lights" && s.sabotage.until > now, vision = (s.me.vision || 185) * S;
      this.ambient.intensity += ((lights ? 0.07 : .6) - this.ambient.intensity) * blend;
      this.sun.intensity += ((lights ? 0.05 : 2.1) - this.sun.intensity) * blend;
      for (const l of this.roomLights) l.intensity += ((lights ? 2 : 28) - l.intensity) * blend;
      this.hero.distance = vision * 1.25;
      this.hero.intensity = lights ? 14 : 22;
      this.scene.environmentIntensity+=((lights?.025:.85)-this.scene.environmentIntensity )*blend;
      this.sky.intensity+=( (lights?.08:.8)-this.sky.intensity )*blend;
      this.sun.position.set(this.me.x*S-12,28,this.me.y*S+16);this.sun.target.position.set(this.me.x*S,0,this.me.y*S);
      this.scene.background.set(lights ? 0x02060a : 0x050d14);
    }
    show(s, now, t, dt, { moved }) {
      const T = this.T, me = this.me, seen = new Set();
      // doors
      const bar = s.sabotage?.kind === "door" ? s.sabotage.door : null;
      for (const [id, mesh] of this.doorBars) { mesh.visible = id === bar; if (id === bar) mesh.material.opacity = 0.3 + Math.sin(t / 220) * 0.1; }
      // consoles: yours glow while the job is open
      const mine = new Set([...s.me.jobs, ...s.recovery].filter((j) => !j.done).map((j) => j.x + "," + j.y));
      for (const c of this.consoles) {
        const on = mine.has(c.s.x + "," + c.s.y);
        c.screenMat.color.setHex(on ? 0xffffff : 0x7f958e);
        c.group.children[1].scale.setScalar(on ? 1 + Math.sin(t / 260) * 0.04 : 1);
      }
      if (this.emergencyCap) this.emergencyCap.scale.y = 1 + Math.sin(t / 300) * 0.25;
      // job beacons
      const live = new Set();
      for (const j of [...s.me.jobs, ...s.recovery, ...s.joints]) {
        if (j.done) continue;
        const statue = String(j.id).startsWith("statue-"), b = this.beacon(j, statue ? 0xb9b0e6 : j.kind === "carry" ? 0x9cf0c3 : 0xe7ca82);
        live.add(j.id);
        const near = W.distance(me, j) < 130, pulse = 1 + Math.sin(t / 420) * 0.12;
        b.ring.scale.setScalar(pulse); b.beam.material.opacity = 0.11 + Math.sin(t / 500) * 0.04; b.name.visible = near;
        b.g.visible = true;
      }
      for (const [id, b] of this.beacons) if (!live.has(id)) b.g.visible = false;
      // delivery spot
      if (s.me.bag) {
        const dest = W.TRANSPORT.find((j) => j.id === s.me.bag.dest);
        this.deliver.visible = !!dest;
        if (dest) { this.deliver.position.set(dest.x * S, 0, dest.y * S); this.deliver.scale.setScalar(1 + Math.sin(t / 300) * 0.06); }
      } else this.deliver.visible = false;
      // footprints and knockout flashes
      while (this.footprints.length < (s.trails?.length || 0) * 4) {
        const m = new T.Mesh(new T.CircleGeometry(0.22, 8), new T.MeshBasicMaterial({ color: 0xe9c87c, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.scale.y = 1.8; this.scene.add(m); this.footprints.push(m);
      }
      let n = 0;
      for (const tr of s.trails || []) for (let i = 0; i < 4; i++) {
        const m = this.footprints[n++]; m.visible = true;
        m.position.set((tr.x + tr.dx * i * 9 + (i % 2 ? 3 : -3)) * S, 0.04, (tr.y + tr.dy * i * 9) * S);
        m.material.opacity = Math.max(0, 1 - (now - tr.at) / 18000) * 0.8;
      }
      for (; n < this.footprints.length; n++) this.footprints[n].visible = false;
      this.events(s, now);
      this.guideDots(s, t, now);
      if (this.pingAt) {
        const k = (t - this.pingAt.at) / 700;
        this.ping.visible = k < 1;
        if (k < 1) { this.ping.position.set(this.pingAt.x * S, 0.05, this.pingAt.y * S); this.ping.scale.setScalar(1 + k * 2.2); this.ping.material.opacity = 1 - k; }
      }
      // knocked-out bodies
      for (const b of s.bodies) {
        const id = "body:" + b.id, person = s.players.find((p) => p.id === b.playerId), p = this.person(id, person);
        seen.add(id);
        p.g.position.set(b.x * S, 0.5, b.y * S);
        p.g.rotation.set(0, 0.4, -Math.PI / 2);
        p.name.visible = false; p.eyes.visible=false;p.closedEyes.visible=true;p.mouth.visible=false; p.bag.visible = false;
        for (const l of p.legs.concat(p.arms)) l.rotation.x = 0;
      }
      // everyone you can see, and you
      const everyone = [...s.nearby.map((p) => ({ ...p, person: s.players.find((q) => q.id === p.id) })), { id: s.meId, x: me.x, y: me.y, own: true, person: s.players.find((q) => q.id === s.meId), bag: !!s.me.bag }];
      for (const q of everyone) {
        const p = this.person(q.id, q.person); seen.add(q.id);
        if (!q.own && p.target) { /* smoothed below */ }
        const prev = p.pos || point(q.x, q.y);
        let pos;
        if (q.own) pos = point(q.x, q.y);
        else {
          // others arrive a few times a second: work out how they are moving and keep them gliding between updates
          const sm = p.sample;
          if (!sm || sm.x !== q.x || sm.y !== q.y) {
            if (sm) { const el = Math.max(0.05, (t - sm.at) / 1000), v = point((q.x - sm.x) / el, (q.y - sm.y) / el), sp = Math.hypot(v.x, v.y); p.vel = sp > W.SPEED * 1.3 ? point(0, 0) : v; if (sp > 300) p.pos = point(q.x, q.y); }
            p.sample = { x: q.x, y: q.y, at: t };
          }
          const el = Math.min(0.45, (t - p.sample.at) / 1000), vel = p.vel || point(0, 0);
          const goal = point(q.x + vel.x * el, q.y + vel.y * el), here = p.pos || goal, gap = W.distance(here, goal), step = Math.min(gap, Math.max(W.SPEED * 1.25, gap * 4) * dt);
          pos = gap < 0.01 ? goal : point(here.x + ((goal.x - here.x) / gap) * step, here.y + ((goal.y - here.y) / gap) * step);
        }
        const speed = W.distance(prev, pos) / Math.max(dt, 0.001);
        p.pos = pos;
        p.g.position.set(pos.x * S, 0, pos.y * S);
        p.g.rotation.set(0, p.facing, 0);
        if (q.own) p.facing = this.facing ?? p.facing;
        else if (speed > 4) { const target = Math.atan2(pos.x - prev.x, pos.y - prev.y); let d = target - p.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); p.facing += d * Math.min(1, dt * 12); }
        else p.facing += 0;
        if (q.own) { let d = (this.facing ?? 0) - p.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); p.facing += d * Math.min(1, dt * 14); }
        const walking = q.own ? moved > 8 : speed > 8;
        p.phase += dt * (walking ? 11 : 0);
        const sw = walking ? Math.sin(p.phase) * 0.7 : 0;
        p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw; p.arms[0].rotation.x = -sw * 0.8; p.arms[1].rotation.x = sw * 0.8;
        p.body.position.y = 1.85 + (walking ? Math.abs(Math.sin(p.phase)) * 0.1 : 0);
        p.bag.visible = !!q.bag;
        const ghost = q.own && !s.me.alive;
        this.fade(p, ghost ? 0.4 : 1);
        p.name.visible = true; p.name.material.opacity = 1;
        // someone right in your face fades so you can still see the room
        if (this.fp && !q.own) { const dist = Math.hypot(pos.x - me.x, pos.y - me.y) * S; p.name.visible = dist > 3; this.fade(p, Math.max(0.12, Math.min(1, (dist - 1.3) / 2.4))); }
        p.g.rotation.z = 0;
      }
      for (const [id, p] of this.people) p.g.visible = seen.has(id) && !(this.fp && id === s.meId);
      this.hero.position.set(me.x * S, 6, me.y * S);
      for (const ex of this.exhibits || []) ex.rotation.y = t / 1800;
      if (this.clockHands) { const d = new Date(), a = [((d.getMinutes() + d.getSeconds() / 60) / 60) * Math.PI * 2, (((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2]; this.clockHands.forEach((h, k) => (h.rotation.x = -a[k])); }
      if (this.dust) {
        this.dust.position.set(me.x * S, 0, me.y * S);
        const a = this.dust.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * (0.08 + (i % 5) * 0.03); if (y < 0) y += 8; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t / 2500 + i) * dt * 0.1); }
        a.needsUpdate = true; this.dust.visible = this.fp;
      }
    }
    events(s, now) {
      const T = this.T;
      while (this.rings.length < (s.events?.length || 0)) {
        const m = new T.Mesh(new T.RingGeometry(0.9, 1.15, 28), new T.MeshBasicMaterial({ color: 0xf38eac, transparent: true, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; this.scene.add(m); this.rings.push(m);
      }
      this.rings.forEach((m, i) => {
        const e = s.events?.[i], k = e ? (now - e.at) / 1200 : 2;
        m.visible = k >= 0 && k < 1;
        if (m.visible) { m.position.set(e.x * S, 0.08, e.y * S); m.scale.setScalar(1 + k * 3); m.material.opacity = 1 - k; }
      });
    }
    // the camera follows you from behind and above; at a console it comes in closer
    follow(s, dt) {
      if (this.fp) return;
      const me = this.me, cam = this.camera, aspect = cam.aspect;
      const zoom = this.zoomTo, k = 1 - Math.pow(0.002, dt);
      const spread = aspect < 0.8 ? 1.3 : aspect < 1.2 ? 1.08 : 0.95;
      const focus = zoom ? point((me.x + zoom.x) / 2, (me.y + zoom.y) / 2) : me;
      const h = (zoom ? 12 : 24) * spread, back = (zoom ? 10 : 20) * spread;
      const aim = new this.T.Vector3(focus.x * S, 0.8, focus.y * S + (zoom ? 3.2 : 0));
      const want = new this.T.Vector3(aim.x, h, aim.z + back);
      this.camPos.lerp(want, k); this.camLook.lerp(aim, k);
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    }
  };
})();
