/* Renders every emergency screen exactly as a user sees it, with its step number.
   If a step is ever skipped, the numbering makes it visible immediately. */
const ROOT=require('path').join(__dirname,'..');
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(ROOT+'/index.html','utf8'),{runScripts:"dangerously",url:"https://x.test/?debug=1",pretendToBeVisual:true});
const w=dom.window,doc=w.document;
w.AudioContext=class{constructor(){this.state="running";this.currentTime=0;this.destination={};}
 resume(){return Promise.resolve();}
 createOscillator(){return{connect(){},start(){},stop(){},frequency:{},type:""};}
 createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}};}
 createBiquadFilter(){return{connect(){},frequency:{},Q:{},type:""};}};
w.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},pause(){},resume(){},speaking:false};
w.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
const $=id=>doc.getElementById(id);
const cur=()=>[...doc.querySelectorAll(".screen.on")].map(e=>e.id)[0];
const settle=()=>new Promise(r=>setTimeout(r,430));
const tap=async id=>{$(id).click();await settle();};
function render(){
  const sc=$(cur());
  const step=(sc.querySelector(".stepno")||{}).textContent||"";
  const head=[...sc.querySelectorAll("h1,h2")].map(e=>e.textContent.trim())[0]||"";
  const body=[...sc.querySelectorAll("p.lede,ul.steps li span")].map(e=>e.textContent.trim());
  const btns=[...sc.querySelectorAll(".foot button")].map(e=>e.textContent.trim().replace(/\s+/g," "));
  console.log("\n┌─ "+cur()+(step?"   ["+step+"]":""));
  console.log("│  "+head);
  body.forEach(b=>console.log("│    · "+b));
  btns.forEach(b=>console.log("│  [ "+b+" ]"));
}
(async()=>{
  await settle();
  console.log("=== RESCUER FLOW, EXACTLY AS RENDERED ===");
  await tap("btn-start");    render();
  await tap("t-q1-no");      render();
  await tap("t-q2-no");      render();
  await tap("t-adult");      render();
  await tap("btn-called");   render();
  render.call && console.log("");
  console.log("\n=== TRANSITION TRACE (what ?debug=1 shows on screen) ===");
  console.log($("trace").textContent.trim());
  process.exit(0);
})();
