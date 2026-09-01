import{p as J,v as ie,g as e,w as re,n as I,s,i as Q,e as D,c as a,b as q,d as te,x as ce,f,y as N,h as oe,a as i,l as H,m as X,u as G,t as E,q as _,r as ne,z as de,j as O,k as U}from"./index-CU3YdpV9.js";import{i as pe}from"./legacy-C7xrFKI0.js";import{C as V}from"./CodePane-De7f5c1P.js";import{T as L}from"./Term-XsuTxf-W.js";const Y={title:"tests/components/api/AuthApi.ts",code:`@atc('PROJ-101')
async authenticateSuccessfully(
  credentials: LoginPayload,
): Promise<[APIResponse, TokenResponse, LoginPayload]> {
  // ACTION: POST login credentials
  const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
    this.config.auth.loginEndpoint,
    credentials,
  );

  // Fixed assertions - validates successful authentication
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  expect(body.token_type).toBe('Bearer');
  expect(body.expires_in).toBeGreaterThan(0);

  // Store token for subsequent requests
  this.setAuthToken(body.access_token);

  // VERIFICATION: Confirm the session is valid via GET /auth/me
  const [meResponse, meBody] = await this.getCurrentUser();
  expect(meResponse.status()).toBe(200);
  expect(meBody.user.email).toBe(credentials.email);

  return [response, body, sentPayload];
}`},Z=[{badge:"①",name:"Identidad",lines:[1],explain:"@atc('PROJ-101') es el carnet de la pieza: el ID de su ticket en el TMS. Cada vez que el método corre, su resultado se reporta con ese ID."},{badge:"②",name:"Precondición",lines:[2,3,4],explain:"El estado inicial no se fabrica dentro: llega por parámetros. Aquí, las credenciales definen QUÉ caso estamos probando."},{badge:"③",name:"Acción",lines:[5,6,7,8,9],explain:"El acto central del caso: un POST al endpoint de login con las credenciales recibidas. Una pieza = una acción de negocio."},{badge:"④",name:"Aserciones fijas",lines:[11,12,13,14,15],explain:"Los resultados que SIEMPRE deben cumplirse para esta pareja precondición + acción. Viven dentro de la pieza, no en el spec."},{badge:"⑤",name:"Verificación",lines:[20,21,22,23],explain:"La prueba de fuego: un GET /auth/me confirma que la sesión quedó activa de verdad. No basta con que el POST devolviera 200."}],ee={title:"tests/components/api/AuthApi.ts",code:`@step
async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
  const [response, body] = await this.apiGET<UserInfoResponse>(this.config.auth.meEndpoint);
  return [response, body];
}`},ae={title:"tests/components/ui/ExamplePage.ts",code:`export class ExamplePage extends UiBase {
  private readonly emailInput = () =>
    this.page
      .getByTestId('email-input')
      .or(this.page.locator('#email'))
      .or(this.page.locator('input[name="email"]'));

  private readonly submitButton = () =>
    this.page.locator('button[type="submit"]').or(this.page.getByTestId('submit-button'));

  @atc('PROJ-101')
  async submitFormWithValidData(data: ExampleFormData) {
    await this.goto();

    await this.emailInput().first().fill(data.email);
    await this.passwordInput().first().fill(data.password);
    await this.submitButton().click();

    await this.page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}`},se=[{key:"verbo",title:"{verbo}",options:[{label:"create",value:"create"},{label:"login",value:"login"},{label:"get",value:"get"}]},{key:"recurso",title:"{Recurso}",options:[{label:"Order",value:"Order"},{label:"User",value:"User"},{label:"— (implícito)",value:""}]},{key:"escenario",title:"{Escenario}",options:[{label:"Successfully",value:"Successfully"},{label:"WithInvalidCredentials",value:"WithInvalidCredentials"},{label:"WithNonExistentId",value:"WithNonExistentId"}]}],ve=[{name:"clickLoginButton",reason:"eso es un click, no un caso de prueba"},{name:"checkTest",reason:"ni verbo de negocio, ni recurso, ni escenario"},{name:"testLogin2",reason:"¿éxito?, ¿error?, ¿qué prueba? — sin escenario no se sabe"}];var ue=_('<span class="hint-hover svelte-ksiw2z">pasa el cursor por una parte para verla en el código →</span> <span class="hint-tap svelte-ksiw2z">pulsa una parte para verla en el código ↑</span>',1),me=_('<span class="explain svelte-ksiw2z"> </span>'),ge=_('<button><span class="studs svelte-ksiw2z" aria-hidden="true"><i class="svelte-ksiw2z"></i><i class="svelte-ksiw2z"></i></span> <span class="head svelte-ksiw2z"><span class="badge svelte-ksiw2z"> </span> <span class="name svelte-ksiw2z"> </span></span> <!></button>'),he=_('<div class="exploded svelte-ksiw2z"><div class="code-side svelte-ksiw2z"><!></div> <div class="parts svelte-ksiw2z" aria-label="Las 5 partes de la pieza"><p class="hint svelte-ksiw2z" aria-hidden="true"><!></p> <!></div></div>');function be(C,S){J(S,!0);let o=X(null);const v=G(()=>e(o)===null?null:Z[e(o)]??null),w=G(()=>{var t;return((t=e(v))==null?void 0:t.lines)??[]}),k=typeof window<"u"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,y=typeof window<"u"&&window.matchMedia("(hover: hover)").matches;let x=X(null);ie(()=>{if(e(o)===null||!e(x))return;const t=e(x).querySelector(".line.hl");t==null||t.scrollIntoView({block:"nearest",inline:"nearest",behavior:k?"auto":"smooth"})});var z=he(),T=a(z),R=a(T);V(R,{get code(){return Y.code},get title(){return Y.title},lineNumbers:!0,get highlight(){return e(w)}}),re(T,t=>I(x,t),()=>e(x));var l=s(T,2),d=a(l),u=a(d);{var b=t=>{var r=ue();i(t,r)},g=t=>{var r=E();q((c,n)=>f(r,`líneas ${c??""}–${n??""}`),[()=>e(v).lines.at(0),()=>e(v).lines.at(-1)]),i(t,r)};Q(u,t=>{e(v)===null?t(b):t(g,-1)})}var P=s(d,2);D(P,19,()=>Z,t=>t.badge,(t,r,c)=>{var n=ge();let h,j;var A=s(a(n),2),B=a(A),M=a(B),F=s(B,2),p=a(F),$=s(A,2);{var m=W=>{var K=me(),le=a(K);q(()=>f(le,e(r).explain)),i(W,K)};Q($,W=>{e(o)===e(c)&&W(m)})}q(()=>{h=te(n,1,"part svelte-ksiw2z",null,h,{active:e(o)===e(c)}),j=ce(n,"",j,{"--i":e(c)}),f(M,e(r).badge),f(p,e(r).name)}),N("mouseenter",n,()=>y&&I(o,e(c),!0)),N("mouseleave",n,()=>y&&I(o,null)),N("focus",n,()=>I(o,e(c),!0)),N("blur",n,()=>I(o,null)),oe("click",n,()=>I(o,e(c),!0)),i(t,n)}),i(C,z),H()}ne(["click"]);var fe=_("<button> </button>"),_e=_('<div class="segment svelte-1v7r8hc"><p class="seg-title svelte-1v7r8hc"> </p> <div class="options svelte-1v7r8hc"></div></div>'),ke=_('<li><code class="bad-name svelte-1v7r8hc"> </code> </li>'),ye=_('<div class="builder svelte-1v7r8hc"><div class="segments svelte-1v7r8hc"></div> <div class="result svelte-1v7r8hc"><code class="name svelte-1v7r8hc"> <span class="paren svelte-1v7r8hc">(…)</span></code> <span class="tag ok">sigue la convención</span></div> <div class="bad svelte-1v7r8hc"><p class="kicker svelte-1v7r8hc">los que NO</p> <ul class="blist"></ul></div></div>');function xe(C,S){J(S,!0);let o=de([0,0,0]);const v=G(()=>se.map((l,d)=>{var u;return((u=l.options[o[d]??0])==null?void 0:u.value)??""}).join(""));var w=ye(),k=a(w);D(k,23,()=>se,l=>l.key,(l,d,u)=>{var b=_e(),g=a(b),P=a(g),t=s(g,2);D(t,23,()=>e(d).options,r=>r.label,(r,c,n)=>{var h=fe();let j;var A=a(h);q(()=>{j=te(h,1,"opt svelte-1v7r8hc",null,j,{picked:o[e(u)]===e(n)}),f(A,e(c).label)}),oe("click",h,()=>o[e(u)]=e(n)),i(r,h)}),q(()=>f(P,e(d).title)),i(l,b)});var y=s(k,2),x=a(y),z=a(x),T=s(y,2),R=s(a(T),2);D(R,21,()=>ve,l=>l.name,(l,d)=>{var u=ke(),b=a(u),g=a(b),P=s(b);q(()=>{f(g,e(d).name),f(P,` → ${e(d).reason??""}`)}),i(l,u)}),q(()=>f(z,e(v))),i(C,w),H()}ne(["click"]);var je=_(`<div class="ch2 svelte-gajpo5"><section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">la unidad mínima de KATA</p> <p class="svelte-gajpo5"><!> significa <strong>Acceptance Test Case</strong> — caso de
      prueba de aceptación. Ojo: <em>no</em> «Automated Test Case». La diferencia importa,
      porque define qué cabe dentro de la pieza:</p> <blockquote class="callout svelte-gajpo5"><strong>Un ATC no es un click; es un caso de prueba completo empaquetado como <!>.</strong> Preparación, acción, verificación y
      aserciones fijas — todo viaja junto, como una pieza de lego que se fabrica una
      vez y se encaja mil veces.</blockquote></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">despiece de la pieza</p> <h2 class="svelte-gajpo5">La anatomía, explotada</h2> <p class="svelte-gajpo5">Este es un ATC real del boilerplate: el login exitoso por API. Explora cada parte del
      despiece y mira qué líneas ocupa dentro del código. El <!> de arriba es su identidad; todo lo demás es el
      caso de prueba en sí.</p> <!></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">contraste</p> <h2 class="svelte-gajpo5">ATC vs helper</h2> <p class="svelte-gajpo5">No todo método merece identidad. Un GET que <em>solo lee</em> — como consultar quién
      está logueado — no cambia nada en el sistema: es un <strong>helper</strong>. Se marca
      con <code class="svelte-gajpo5">@step</code>, sin ID de ticket, y no se reporta al TMS.</p> <div class="contrast svelte-gajpo5"><div class="contrast-col svelte-gajpo5"><span class="tag ok svelte-gajpo5">ATC — cambia estado</span> <p class="mini svelte-gajpo5">Hace login (crea una sesión). Lleva <code class="svelte-gajpo5">@atc('PROJ-101')</code> y cada
          ejecución reporta su resultado.</p></div> <div class="contrast-col svelte-gajpo5"><span class="tag svelte-gajpo5">helper — solo lectura</span> <!> <p class="mini svelte-gajpo5">Solo pregunta. Sin ID, sin reporte: existe para servir a los ATCs.</p></div></div></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">la variante de pantalla</p> <h2 class="svelte-gajpo5">El mismo patrón en UI</h2> <p class="svelte-gajpo5">En una página, la pieza incluye también sus <strong>locators inline</strong>: la
      dirección del botón vive DENTRO de la pieza, no en un archivo aparte. Si mañana
      cambia el botón, se arregla en un solo lugar.</p> <!> <p class="callout svelte-gajpo5" style="margin-top: 14px">Fíjate: los locators son propiedades privadas de la clase porque se usan en 2+
      ATCs. Si un locator se usa en uno solo, se escribe directamente dentro del ATC.
      Los archivos <code class="svelte-gajpo5">locators/*.ts</code> están prohibidos.</p></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">bautizar la pieza</p> <h2 class="svelte-gajpo5">El nombre lo dice todo</h2> <p class="svelte-gajpo5">Un ATC se nombra <code class="svelte-gajpo5"></code>: quién recibe el <!> y qué se espera que pase. Arma un nombre válido
      combinando segmentos — y mira los que nunca pasarían revisión. Cada <!> del caso queda anunciada desde el nombre:
      «Successfully» promete 200; «WithInvalidCredentials» promete 401.</p> <!></section></div>`);function qe(C,S){J(S,!1);const o=typeof window<"u"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,v=p=>o?{duration:0}:{y:18,duration:420,delay:90*p};pe();var w=je(),k=a(w),y=s(a(k),2),x=a(y);L(x,{t:"atc",children:(p,$)=>{var m=E("ATC");i(p,m)},$$slots:{default:!0}});var z=s(y,2),T=a(z),R=s(a(T));L(R,{t:"método",children:(p,$)=>{var m=E("método");i(p,m)},$$slots:{default:!0}});var l=s(k,2),d=s(a(l),4),u=s(a(d));L(u,{t:"decorador",children:(p,$)=>{var m=E("decorador");i(p,m)},$$slots:{default:!0}});var b=s(d,2);be(b,{});var g=s(l,2),P=s(a(g),6),t=s(a(P),2),r=s(a(t),2);V(r,{get code(){return ee.code},get title(){return ee.title}});var c=s(g,2),n=s(a(c),6);V(n,{get code(){return ae.code},get title(){return ae.title}});var h=s(c,2),j=s(a(h),4),A=s(a(j));A.textContent="{verbo}{Recurso}{Escenario}";var B=s(A,2);L(B,{t:"payload",children:(p,$)=>{var m=E("payload");i(p,m)},$$slots:{default:!0}});var M=s(B,2);L(M,{t:"aserción",children:(p,$)=>{var m=E("aserción");i(p,m)},$$slots:{default:!0}});var F=s(j,2);xe(F,{}),O(1,k,()=>U,()=>v(0)),O(1,l,()=>U,()=>v(1)),O(1,g,()=>U,()=>v(2)),O(1,c,()=>U,()=>v(3)),O(1,h,()=>U,()=>v(4)),i(C,w),H()}export{qe as default};
