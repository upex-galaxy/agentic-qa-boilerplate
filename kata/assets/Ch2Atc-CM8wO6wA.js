import{A as e,B as t,C as n,D as r,E as i,G as a,H as o,I as s,K as c,L as l,M as u,N as d,O as f,P as p,R as m,S as h,T as g,U as _,V as v,f as y,h as b,k as x,o as S,p as C,r as w,s as T,v as E,x as D,z as O}from"./index-BItWU7PD.js";import"./legacy-CoM7i2-e.js";import{t as k}from"./CodePane-Bicj8wES.js";import{t as A}from"./Term-saWUSTyy.js";var j={title:`tests/components/api/AuthApi.ts`,code:`@atc('PROJ-101')
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
}`},M=[{badge:`①`,name:`Identidad`,lines:[1],explain:`@atc('PROJ-101') es el carnet de la pieza: el ID de su ticket en el TMS. Cada vez que el método corre, su resultado se reporta con ese ID.`},{badge:`②`,name:`Precondición`,lines:[2,3,4],explain:`El estado inicial no se fabrica dentro: llega por parámetros. Aquí, las credenciales definen QUÉ caso estamos probando.`},{badge:`③`,name:`Acción`,lines:[5,6,7,8,9],explain:`El acto central del caso: un POST al endpoint de login con las credenciales recibidas. Una pieza = una acción de negocio.`},{badge:`④`,name:`Aserciones fijas`,lines:[11,12,13,14,15],explain:`Los resultados que SIEMPRE deben cumplirse para esta pareja precondición + acción. Viven dentro de la pieza, no en el spec.`},{badge:`⑤`,name:`Verificación`,lines:[20,21,22,23],explain:`La prueba de fuego: un GET /auth/me confirma que la sesión quedó activa de verdad. No basta con que el POST devolviera 200.`}],N={title:`tests/components/api/AuthApi.ts`,code:`@step
async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
  const [response, body] = await this.apiGET<UserInfoResponse>(this.config.auth.meEndpoint);
  return [response, body];
}`},P={title:`tests/components/ui/ExamplePage.ts`,code:`export class ExamplePage extends UiBase {
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
}`},F=[{key:`verbo`,title:`{verbo}`,options:[{label:`create`,value:`create`},{label:`login`,value:`login`},{label:`get`,value:`get`}]},{key:`recurso`,title:`{Recurso}`,options:[{label:`Order`,value:`Order`},{label:`User`,value:`User`},{label:`— (implícito)`,value:``}]},{key:`escenario`,title:`{Escenario}`,options:[{label:`Successfully`,value:`Successfully`},{label:`WithInvalidCredentials`,value:`WithInvalidCredentials`},{label:`WithNonExistentId`,value:`WithNonExistentId`}]}],I=[{name:`clickLoginButton`,reason:`eso es un click, no un caso de prueba`},{name:`checkTest`,reason:`ni verbo de negocio, ni recurso, ni escenario`},{name:`testLogin2`,reason:`éxito?, error?, qué prueba? — sin escenario no se sabe`}],L=g(`<span class="hint-hover svelte-ksiw2z">pasa el cursor por una parte para verla en el código →</span> <span class="hint-tap svelte-ksiw2z">pulsa una parte para verla en el código ↑</span>`,1),R=g(`<span class="explain svelte-ksiw2z"> </span>`),z=g(`<button><span class="studs svelte-ksiw2z" aria-hidden="true"><i class="svelte-ksiw2z"></i><i class="svelte-ksiw2z"></i></span> <span class="head svelte-ksiw2z"><span class="badge svelte-ksiw2z"> </span> <span class="name svelte-ksiw2z"> </span></span> <!></button>`),B=g(`<div class="exploded svelte-ksiw2z"><div class="code-side svelte-ksiw2z"><!></div> <div class="parts svelte-ksiw2z" aria-label="Las 5 partes de la pieza"><p class="hint svelte-ksiw2z" aria-hidden="true"><!></p> <!></div></div>`);function V(r,m){_(m,!0);let g=t(null),b=v(()=>e(g)===null?null:M[e(g)]??null),S=v(()=>e(b)?.lines??[]),w=typeof window<`u`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,A=typeof window<`u`&&window.matchMedia(`(hover: hover)`).matches,N=t(null);d(()=>{e(g)!==null&&e(N)&&e(N).querySelector(`.line.hl`)?.scrollIntoView({block:`nearest`,inline:`nearest`,behavior:w?`auto`:`smooth`})});var P=B(),F=p(P),I=p(F);k(I,{get code(){return j.code},get title(){return j.title},lineNumbers:!0,get highlight(){return e(S)}}),c(F),T(F,e=>O(N,e),()=>e(N));var V=l(F,2),H=p(V),U=p(H),W=e=>{var t=L();a(2),n(e,t)},G=t=>{var r=i();u((e,t)=>h(r,`líneas ${e??``}–${t??``}`),[()=>e(b).lines.at(0),()=>e(b).lines.at(-1)]),n(t,r)};D(U,t=>{e(b)===null?t(W):t(G,-1)}),c(H);var K=l(H,2);E(K,19,()=>M,e=>e.badge,(t,r,i)=>{var a=z();let o,d;var m=l(p(a),2),_=p(m),v=s(_,!0),b=l(_,2),S=s(b,!0);c(m);var w=l(m,2),T=t=>{var i=R(),a=s(i,!0);u(()=>h(a,e(r).explain)),n(t,i)};D(w,t=>{e(g)===e(i)&&t(T)}),c(a),u(()=>{o=C(a,1,`part svelte-ksiw2z`,null,o,{active:e(g)===e(i)}),d=y(a,``,d,{"--i":e(i)}),h(v,e(r).badge),h(S,e(r).name)}),x(`mouseenter`,a,()=>A&&O(g,e(i),!0)),x(`mouseleave`,a,()=>A&&O(g,null)),x(`focus`,a,()=>O(g,e(i),!0)),x(`blur`,a,()=>O(g,null)),f(`click`,a,()=>O(g,e(i),!0)),n(t,a)}),c(V),c(P),n(r,P),o()}r([`click`]);var H=g(`<button> </button>`),U=g(`<div class="segment svelte-1v7r8hc"><p class="seg-title svelte-1v7r8hc"> </p> <div class="options svelte-1v7r8hc"></div></div>`),W=g(`<li><code class="bad-name svelte-1v7r8hc"> </code> </li>`),G=g(`<div class="builder svelte-1v7r8hc"><div class="segments svelte-1v7r8hc"></div> <div class="result svelte-1v7r8hc"><code class="name svelte-1v7r8hc"> <span class="paren svelte-1v7r8hc">(…)</span></code> <span class="tag ok">sigue la convención</span></div> <div class="bad svelte-1v7r8hc"><p class="kicker svelte-1v7r8hc">los que NO</p> <ul class="blist"></ul></div></div>`);function K(t,r){_(r,!0);let i=m([0,0,0]),d=v(()=>F.map((e,t)=>e.options[i[t]??0]?.value??``).join(``));var g=G(),y=p(g);E(y,23,()=>F,e=>e.key,(t,r,a)=>{var o=U(),d=p(o),m=s(d,!0),g=l(d,2);E(g,23,()=>e(r).options,e=>e.label,(t,r,o)=>{var c=H();let l;var d=s(c,!0);u(()=>{l=C(c,1,`opt svelte-1v7r8hc`,null,l,{picked:i[e(a)]===e(o)}),h(d,e(r).label)}),f(`click`,c,()=>i[e(a)]=e(o)),n(t,c)}),c(g),c(o),u(()=>h(m,e(r).title)),n(t,o)}),c(y);var b=l(y,2),x=p(b),S=p(x,!0);a(),c(x),a(2),c(b);var w=l(b,2),T=l(p(w),2);E(T,21,()=>I,e=>e.name,(t,r)=>{var i=W(),a=p(i),o=s(a,!0),d=l(a);c(i),u(()=>{h(o,e(r).name),h(d,` → ${e(r).reason??``}`)}),n(t,i)}),c(T),c(w),c(g),u(()=>h(S,e(d))),n(t,g),o()}r([`click`]);var q=g(`<div class="ch2 svelte-gajpo5"><section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">la unidad mínima de KATA</p> <p class="svelte-gajpo5"><!> significa <strong>Acceptance Test Case</strong> — caso de
      prueba de aceptación. Ojo: <em>no</em> «Automated Test Case». La diferencia importa,
      porque define qué cabe dentro de la pieza:</p> <blockquote class="callout svelte-gajpo5"><strong>Un ATC no es un click; es un caso de prueba completo empaquetado como <!>.</strong> Preparación, acción, verificación y
      aserciones fijas — todo viaja junto, como una pieza de lego que se fabrica una
      vez y se encaja mil veces.</blockquote></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">despiece de la pieza</p> <h2 class="svelte-gajpo5">La anatomía, explotada</h2> <p class="svelte-gajpo5">Este es un ATC real del boilerplate: el login exitoso por API. Explora cada parte del
      despiece y mira qué líneas ocupa dentro del código. El <!> de arriba es su identidad; todo lo demás es el
      caso de prueba en sí.</p> <!></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">contraste</p> <h2 class="svelte-gajpo5">ATC vs helper</h2> <p class="svelte-gajpo5">No todo método merece identidad. Un GET que <em>solo prepara datos</em> — como consultar
      quién está logueado para el paso siguiente — no es el resultado que se prueba: es un <strong>helper</strong>. Se marca con <code class="svelte-gajpo5">@step</code>, sin ID de ticket, y no se
      reporta al TMS. Si la respuesta del GET <em>es</em> lo que se prueba (los datos
      correctos, un 401, un 403, un 404), ese GET sí es un ATC.</p> <div class="contrast svelte-gajpo5"><div class="contrast-col svelte-gajpo5"><span class="tag ok svelte-gajpo5">ATC — cambia estado</span> <p class="mini svelte-gajpo5">Hace login (crea una sesión). Lleva <code class="svelte-gajpo5">@atc('PROJ-101')</code> y cada
          ejecución reporta su resultado.</p></div> <div class="contrast-col svelte-gajpo5"><span class="tag svelte-gajpo5">helper — prepara datos</span> <!> <p class="mini svelte-gajpo5">Solo pregunta. Sin ID, sin reporte: existe para servir a los ATCs.</p></div></div></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">la variante de pantalla</p> <h2 class="svelte-gajpo5">El mismo patrón en UI</h2> <p class="svelte-gajpo5">En una página, la pieza incluye también sus <strong>locators inline</strong>: la
      dirección del botón vive DENTRO de la pieza, no en un archivo aparte. Si mañana
      cambia el botón, se arregla en un solo lugar.</p> <!> <p class="callout svelte-gajpo5" style="margin-top: 14px">Fíjate: los locators son propiedades privadas de la clase porque se usan en 2+
      ATCs. Si un locator se usa en uno solo, se escribe directamente dentro del ATC.
      Los archivos <code class="svelte-gajpo5">locators/*.ts</code> están prohibidos.</p></section> <section class="svelte-gajpo5"><p class="kicker svelte-gajpo5">bautizar la pieza</p> <h2 class="svelte-gajpo5">El nombre lo dice todo</h2> <p class="svelte-gajpo5">Un ATC se nombra <code class="svelte-gajpo5"></code>: quién recibe el <!> y qué se espera que pase. Arma un nombre válido
      combinando segmentos — y mira los que nunca pasarían revisión. Cada <!> del caso queda anunciada desde el nombre:
      «Successfully» promete 200; «WithInvalidCredentials» promete 401.</p> <!></section></div>`);function J(e,t){_(t,!1);let r=typeof window<`u`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,s=e=>r?{duration:0}:{y:18,duration:420,delay:90*e};S();var u=q(),d=p(u),f=l(p(d),2),m=p(f);A(m,{t:`atc`,children:(e,t)=>{a();var r=i(`ATC`);n(e,r)},$$slots:{default:!0}}),a(5),c(f);var h=l(f,2),g=p(h),v=l(p(g));A(v,{t:`método`,children:(e,t)=>{a();var r=i(`método`);n(e,r)},$$slots:{default:!0}}),a(),c(g),a(),c(h),c(d);var y=l(d,2),x=l(p(y),4),C=l(p(x));A(C,{t:`decorador`,children:(e,t)=>{a();var r=i(`decorador`);n(e,r)},$$slots:{default:!0}}),a(),c(x),V(l(x,2),{}),c(y);var T=l(y,2),E=l(p(T),6),D=l(p(E),2),O=l(p(D),2);k(O,{get code(){return N.code},get title(){return N.title}}),a(2),c(D),c(E),c(T);var j=l(T,2),M=l(p(j),6);k(M,{get code(){return P.code},get title(){return P.title}}),a(2),c(j);var F=l(j,2),I=l(p(F),4),L=l(p(I));L.textContent=`{verbo}{Recurso}{Escenario}`;var R=l(L,2);A(R,{t:`payload`,children:(e,t)=>{a();var r=i(`payload`);n(e,r)},$$slots:{default:!0}});var z=l(R,2);A(z,{t:`aserción`,children:(e,t)=>{a();var r=i(`aserción`);n(e,r)},$$slots:{default:!0}}),a(),c(I),K(l(I,2),{}),c(F),c(u),b(1,d,()=>w,()=>s(0)),b(1,y,()=>w,()=>s(1)),b(1,T,()=>w,()=>s(2)),b(1,j,()=>w,()=>s(3)),b(1,F,()=>w,()=>s(4)),n(e,u),o()}export{J as default};