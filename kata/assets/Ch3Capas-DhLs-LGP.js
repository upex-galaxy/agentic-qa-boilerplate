import{A as e,B as t,C as n,D as r,E as i,F as a,G as o,H as s,I as c,K as l,L as u,M as d,N as f,O as p,P as m,S as h,T as g,U as _,V as v,b as y,d as b,h as x,n as S,p as C,r as w,s as T,v as E,w as D,x as O,z as k}from"./index-BItWU7PD.js";import{t as ee}from"./CodePane-Bicj8wES.js";import{t as A}from"./Term-saWUSTyy.js";var j=[{id:`tests`,level:`specs`,name:`Tests`,tenants:`tests/e2e/*.test.ts · tests/integration/*.test.ts`,role:`Los specs ORQUESTAN: destructuran el fixture, llaman ATCs y añaden aserciones de flujo. Casi no tienen lógica propia. NO es una capa: consume el Fixture (L4).`,rules:[`Jerarquía: carpeta = módulo → archivo = feature → describe = ticket → test = escenario.`,`Las aserciones fijas viven dentro del ATC; el spec solo añade las de flujo.`],samples:[{title:`tests/integration/auth/user-session.test.ts`,sourcePath:`tests/integration/auth/user-session.test.ts`,code:`import { expect, test } from '@TestFixture';
import { config } from '@variables';

test.describe('UPEX-100: User session', () => {
  test('UPEX-100: should be able to re-authenticate', async ({ api }) => {
    api.clearAuthToken();

    const credentials = {
      email: config.testUser.email,
      password: config.testUser.password,
    };
    const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

    expect(response.status()).toBe(200);
    expect(tokenData.access_token).toBeDefined();
  });
});
`}]},{id:`fixtures`,level:`L4`,name:`Fixtures`,tenants:`TestFixture · ApiFixture · UiFixture`,role:`Inyección de dependencias: entregan la caja de herramientas ya armada. El test pide { api }, { ui } o { test } y Playwright construye SOLO lo necesario.`,rules:[`Construcción lazy: { api } jamás abre navegador.`,`El fixture conecta los componentes entre sí (ej. propaga el token a todos).`],samples:[{title:`tests/components/ApiFixture.ts`,sourcePath:`tests/components/ApiFixture.ts`,code:`export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;
  readonly example: ExampleApi;

  constructor(options: TestContextOptions) {
    super(options);
    this.auth = new AuthApi(options);
    this.example = new ExampleApi(options);
  }

  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.example.setAuthToken(token);
  }
}
`},{title:`registro en Playwright (lazy — { api } no abre navegador)`,sourcePath:`tests/components/TestFixture.ts`,code:`export const test = base.extend<{
  test: TestFixture
  api: ApiFixture
  ui: UiFixture
}>({
  test: async ({ page, request }, use) => {
    await use(new TestFixture(page, request));
  },
  ui: async ({ page, request }, use) => {
    await use(new UiFixture({ page, request }));
  },
  api: async ({ request }, use) => {
    await use(new ApiFixture({ request }));
  },
});
`}]},{id:`dominio`,level:`L3`,name:`Dominio`,tenants:`AuthApi · LoginPage · CheckoutPage`,role:`La lógica de negocio de CADA recurso o página. AQUÍ viven los ATCs, decorados con @atc('TICKET-ID').`,rules:[`Acción que cambia estado = ATC (@atc); un GET cuya respuesta ES el resultado probado (datos, 401, 403, 404) también; helper = lectura que solo prepara datos (@step, sin ID, no se reporta al TMS).`,`Locators inline dentro del ATC; se extraen solo si se usan en 2+ ATCs.`],chainNode:`AuthApi`,samples:[{title:`tests/components/api/AuthApi.ts — un ATC completo`,sourcePath:`tests/components/api/AuthApi.ts`,code:`@atc('PROJ-101')
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
}
`}]},{id:`steps`,level:`L3.5`,name:`Steps (entrepiso)`,tenants:`AuthSteps…`,role:`Cadenas de ATCs para preparación reutilizable (cuando 3+ ATCs se repiten en 3+ tests). No lleva @atc: no se reporta al TMS.`,rules:[`Un ATC NUNCA llama a otro ATC — las cadenas viven aquí, en Steps.`,`Sin @atc: los Steps preparan escenarios, no declaran casos de prueba.`],samples:[{title:`AuthSteps — cadena de ATCs SIN @atc (doctrina)`,sourcePath:`.agents/skills/test-automation/references/kata-architecture.md`,code:`// tests/components/steps/AuthSteps.ts
import type { TestContextOptions } from '@TestContext';
import { TestContext } from '@TestContext';

export class AuthSteps extends TestContext {
  constructor(options: TestContextOptions = {}) {
    super(options);
  }

  async navigateAsAuthenticatedUser(args: { path: string, email: string, password: string }) {
    if (!this._page || !this._request) {
      throw new Error('Page and Request context must be set.');
    }
    const auth = await this.authenticateUser(email, password);
    await this._page.evaluate(token => localStorage.setItem('authToken', token), auth.token);
  }
}
`}]},{id:`bases`,level:`L2`,name:`Bases`,tenants:`ApiBase (HTTP) · UiBase (Playwright)`,role:`Helpers técnicos: ApiBase ofrece métodos HTTP tipados que devuelven tuplas; UiBase, helpers de navegador (intercepción de red, esperas por condición).`,rules:[`Contrato de tuplas: GET/DELETE → [respuesta, cuerpo]; POST/PUT/PATCH → [respuesta, cuerpo, payloadEnviado].`,`Fail-fast en público: si pides page sin fixture UI, UiBase lanza un error descriptivo.`],chainNode:`ApiBase`,samples:[{title:`tests/components/api/ApiBase.ts — apiPOST (fragmento)`,sourcePath:`tests/components/api/ApiBase.ts`,code:`protected async apiPOST<TBody, TPayload>(
  endpoint: string,
  data: TPayload,
  options: RequestOptions = {},
): Promise<[APIResponse, TBody, TPayload]> {
  const url = this.apiEndpoint(endpoint);
  const headers = this.buildHeaders(options.headers);

  const response = await this.request.post(url, { headers, data, params: options.params });
  const body = await this.getResponseJsonObject<TBody>(response);

  await attachRequestResponseToAllure({ url: endpoint, method: 'POST', responseBody: body, requestBody: data });

  return [response, body, data];
}
`},{title:`tests/components/ui/UiBase.ts — el guardián fail-fast`,sourcePath:`tests/components/ui/UiBase.ts`,code:`get page(): Page {
  if (!this._page) {
    throw new Error(
      'Page is not available. UiBase requires a page instance. '
      + 'Make sure you are using a UI fixture (ui or test), not api.',
    );
  }
  return this._page;
}
`}]},{id:`contexto`,level:`L1`,name:`TestContext`,tenants:`config · faker · entorno`,role:`Los cimientos agnósticos: qué entorno, qué credenciales, qué datos falsos — sin nada de Playwright ni HTTP.`,rules:[`Agnóstico total: si mencionara Playwright o HTTP, ya no sería el cimiento.`,`Cada test genera sus propios datos (faker) — nada de estado compartido.`],chainNode:`TestContext`,samples:[{title:`tests/components/TestContext.ts — la clase completa`,sourcePath:`tests/components/TestContext.ts`,code:`export class TestContext {
  protected readonly _page?: Page;
  protected readonly _request?: APIRequestContext;
  readonly env: Environment;
  readonly config = config;
  static readonly data = DataFactory;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }

  get data(): typeof DataFactory {
    return TestContext.data;
  }
}
`}]}],te=[`AuthApi`,`ApiBase`,`TestContext`],ne=g(`<span class="ext svelte-nu7zxe" aria-hidden="true">─extends→</span>`),re=g(`<span class="chain-unit svelte-nu7zxe"><!> <code> </code></span>`),ie=g(`<button><span class="level svelte-nu7zxe"> </span> <span class="fname svelte-nu7zxe"> </span> <span class="tenants svelte-nu7zxe"> </span></button>`),ae=g(`<div class="floor-slot svelte-nu7zxe"><button><span class="level svelte-nu7zxe"> </span> <span class="fname svelte-nu7zxe"> </span> <span class="tenants svelte-nu7zxe"> </span></button> <!></div>`),oe=g(`<li class="svelte-nu7zxe"> </li>`),se=g(`<article class="room svelte-nu7zxe"><header class="svelte-nu7zxe"><span class="tag svelte-nu7zxe"> </span> <h3 class="svelte-nu7zxe"> </h3></header> <p class="role svelte-nu7zxe"> </p> <ul class="blist svelte-nu7zxe"></ul> <!></article>`),M=g(`<div class="room-hint svelte-nu7zxe"><span class="hint-arrow svelte-nu7zxe" aria-hidden="true">←</span> <span class="hint-tap svelte-nu7zxe" aria-hidden="true">pulsa un piso ↑</span> <p class="svelte-nu7zxe">Elige un piso del edificio para entrar. Cada habitación muestra su rol, sus reglas y el
            código REAL del boilerplate que vive ahí.</p></div>`),N=g(`<div class="chapter-body svelte-nu7zxe"><section class="intro svelte-nu7zxe"><p class="kicker svelte-nu7zxe">por qué capas?</p> <h2 class="svelte-nu7zxe">Un edificio donde cada piso tiene UN trabajo</h2> <p class="prose svelte-nu7zxe">KATA organiza el código de pruebas como un edificio. Cada piso es un <!> con una sola responsabilidad, y la regla de circulación es
      estricta: un piso superior usa al de abajo — nunca al revés. Los cimientos no saben nada de
      los tests; los tests lo saben todo de los cimientos.</p> <p class="prose svelte-nu7zxe">El ascensor entre pisos es la <!>: cada <!> de dominio nace encima de su base y recibe gratis todos sus <!> (<code class="svelte-nu7zxe">AuthApi extends ApiBase extends TestContext</code>).
      Y en la azotea, el <!> entrega el edificio entero, ya armado, a
      cada test. Elige un piso para entrar a su habitación.</p></section> <section class="tour svelte-nu7zxe"><div class="left svelte-nu7zxe"><div class="chain svelte-nu7zxe" aria-label="Cadena de herencia entre capas"><span class="chain-kicker svelte-nu7zxe">cadena de herencia</span> <div class="chain-row svelte-nu7zxe"></div></div> <div class="building svelte-nu7zxe" role="group" aria-label="El edificio KATA, piso por piso"><div class="roof svelte-nu7zxe" aria-hidden="true"></div> <!> <div class="ground svelte-nu7zxe" aria-hidden="true"></div></div></div> <div class="room-col svelte-nu7zxe" aria-live="polite"><!></div></section> <section class="svelte-nu7zxe"><div class="callout good svelte-nu7zxe"><strong class="svelte-nu7zxe">La regla de oro de dirección: una capa superior usa a la inferior, nunca al revés.</strong> TestContext no sabe qué es un test. ApiBase no sabe qué es AuthApi. Por eso, cambiar un piso
      de arriba jamás agrieta los cimientos.</div></section></div>`);function P(r,g){_(g,!0);let P=typeof window<`u`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,F=e=>P?0:e,I=t(null),L=v(()=>j.find(t=>t.id===e(I))??null),ce=v(()=>j.filter(e=>e.id!==`steps`)),R=v(()=>j.find(e=>e.id===`steps`)),z=t(null);function B(t){k(I,e(I)===t?null:t,!0)}f(()=>{e(L)&&e(z)&&window.matchMedia(`(max-width: 900px)`).matches&&e(z).scrollIntoView({block:`start`,behavior:P?`auto`:`smooth`})});var V=N(),H=m(V),U=u(m(H),4),le=u(m(U));A(le,{t:`módulo`,children:(e,t)=>{o();var r=i(`módulo`);n(e,r)},$$slots:{default:!0}}),o(),l(U);var W=u(U,2),G=u(m(W));A(G,{t:`herencia`,children:(e,t)=>{o();var r=i(`herencia`);n(e,r)},$$slots:{default:!0}});var K=u(G,2);A(K,{t:`clase`,children:(e,t)=>{o();var r=i(`clase`);n(e,r)},$$slots:{default:!0}});var q=u(K,2);A(q,{t:`método`,children:(e,t)=>{o();var r=i(`métodos`);n(e,r)},$$slots:{default:!0}});var ue=u(q,4);A(ue,{t:`fixture`,children:(e,t)=>{o();var r=i(`fixture`);n(e,r)},$$slots:{default:!0}}),o(),l(W),l(H);var J=u(H,2),Y=m(J),X=m(Y),Z=u(m(X),2);E(Z,22,()=>te,e=>e,(t,r,i)=>{var a=re(),o=m(a),s=e=>{var t=ne();n(e,t)};O(o,t=>{e(i)>0&&t(s)});var f=u(o,2);let p;var g=c(f,!0);l(a),d(()=>{p=C(f,1,`node svelte-nu7zxe`,null,p,{lit:e(L)?.chainNode===r}),h(g,r)}),n(t,a)}),l(Z),l(X);var Q=u(X,2),de=u(m(Q),2);E(de,19,()=>e(ce),e=>e.id,(t,r,i)=>{var a=ae(),o=m(a);let s;var f=m(o),g=c(f,!0),_=u(f,2),v=c(_,!0),y=u(_,2),S=c(y,!0);l(o);var T=u(o,2),E=t=>{var r=ie();let i;var a=m(r),o=c(a,!0),s=u(a,2),f=c(s,!0),g=u(s,2),_=c(g,!0);l(r),d(()=>{i=C(r,1,`floor mezzanine svelte-nu7zxe`,null,i,{active:e(I)===`steps`}),b(r,`aria-pressed`,e(I)===`steps`),h(o,e(R).level),h(f,e(R).name),h(_,e(R).tenants)}),p(`click`,r,()=>B(`steps`)),n(t,r)};O(T,t=>{e(r).id===`dominio`&&t(E)}),l(a),d(()=>{s=C(o,1,`floor svelte-nu7zxe`,null,s,{active:e(I)===e(r).id}),b(o,`aria-pressed`,e(I)===e(r).id),h(g,e(r).level),h(v,e(r).name),h(S,e(r).tenants)}),p(`click`,o,()=>B(e(r).id)),x(5,a,()=>w,()=>({y:-10,duration:F(350),delay:F(200+e(i)*90)})),n(t,a)}),o(2),l(Q),l(Y);var $=u(Y,2),fe=m($),pe=t=>{var r=D(),i=a(r);y(i,()=>e(L).id,t=>{var r=se(),i=m(r),a=m(i),o=c(a,!0),s=u(a,2),f=c(s,!0);l(i);var p=u(i,2),g=c(p,!0),_=u(p,2);E(_,20,()=>e(L).rules,e=>e,(e,t)=>{var r=oe(),i=c(r,!0);d(()=>h(i,t)),n(e,r)}),l(_);var v=u(_,2);E(v,17,()=>e(L).samples,e=>e.title,(t,n)=>{ee(t,{get code(){return e(n).code},get title(){return e(n).title}})}),l(r),d(()=>{h(o,e(L).level),h(f,e(L).name),h(g,e(L).role)}),x(1,r,()=>w,()=>({x:18,duration:F(320)})),n(t,r)}),n(t,r)},me=e=>{var t=M();x(3,t,()=>S,()=>({duration:F(200)})),n(e,t)};O(fe,t=>{e(L)?t(pe):t(me,-1)}),l($),T($,e=>k(z,e),()=>e(z)),l(J);var he=u(J,2);l(V),x(5,H,()=>w,()=>({y:18,duration:F(450)})),x(5,J,()=>w,()=>({y:18,duration:F(450),delay:F(140)})),x(5,he,()=>w,()=>({y:18,duration:F(450),delay:F(260)})),n(r,V),s()}r([`click`]);export{P as default};