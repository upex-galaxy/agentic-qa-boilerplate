import{p as Te,v as Ae,g as t,s as a,c as s,t as C,a as i,e as U,i as $,b as P,d as I,f as c,h as W,j as y,k as z,w as _e,n as Z,l as ye,m as ee,u as R,A as be,B as Ce,C as Pe,o as ze,q as m,r as ke}from"./index-qtBjtlY8.js";import{T as k,s as te}from"./Term-PVYUzd1b.js";import{C as we}from"./CodePane-DG_3N89l.js";const N=[{id:"tests",level:"specs",name:"Tests",tenants:"tests/e2e/*.test.ts · tests/integration/*.test.ts",role:"Los specs ORQUESTAN: destructuran el fixture, llaman ATCs y añaden aserciones de flujo. Casi no tienen lógica propia. NO es una capa: consume el Fixture (L4).",rules:["Jerarquía: carpeta = módulo → archivo = feature → describe = ticket → test = escenario.","Las aserciones fijas viven dentro del ATC; el spec solo añade las de flujo."],samples:[{title:"tests/integration/auth/user-session.test.ts",sourcePath:"tests/integration/auth/user-session.test.ts",code:`import { expect, test } from '@TestFixture';
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
`}]},{id:"fixtures",level:"L4",name:"Fixtures",tenants:"TestFixture · ApiFixture · UiFixture",role:"Inyección de dependencias: entregan la caja de herramientas ya armada. El test pide { api }, { ui } o { test } y Playwright construye SOLO lo necesario.",rules:["Construcción lazy: { api } jamás abre navegador.","El fixture conecta los componentes entre sí (ej. propaga el token a todos)."],samples:[{title:"tests/components/ApiFixture.ts",sourcePath:"tests/components/ApiFixture.ts",code:`export class ApiFixture extends ApiBase {
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
`},{title:"registro en Playwright (lazy — { api } no abre navegador)",sourcePath:"tests/components/TestFixture.ts",code:`export const test = base.extend<{
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
`}]},{id:"dominio",level:"L3",name:"Dominio",tenants:"AuthApi · LoginPage · CheckoutPage",role:"La lógica de negocio de CADA recurso o página. AQUÍ viven los ATCs, decorados con @atc('TICKET-ID').",rules:["Acción que cambia estado = ATC (@atc); helper de solo lectura = @step (sin ID, no se reporta al TMS).","Locators inline dentro del ATC; se extraen solo si se usan en 2+ ATCs."],chainNode:"AuthApi",samples:[{title:"tests/components/api/AuthApi.ts — un ATC completo",sourcePath:"tests/components/api/AuthApi.ts",code:`@atc('PROJ-101')
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
`}]},{id:"steps",level:"L3.5",name:"Steps (entrepiso)",tenants:"AuthSteps…",role:"Cadenas de ATCs para preparación reutilizable (cuando 3+ ATCs se repiten en 3+ tests). No lleva @atc: no se reporta al TMS.",rules:["Un ATC NUNCA llama a otro ATC — las cadenas viven aquí, en Steps.","Sin @atc: los Steps preparan escenarios, no declaran casos de prueba."],samples:[{title:"AuthSteps — cadena de ATCs SIN @atc (doctrina)",sourcePath:".agents/skills/test-automation/references/kata-architecture.md",code:`// tests/components/steps/AuthSteps.ts
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
`}]},{id:"bases",level:"L2",name:"Bases",tenants:"ApiBase (HTTP) · UiBase (Playwright)",role:"Helpers técnicos: ApiBase ofrece métodos HTTP tipados que devuelven tuplas; UiBase, helpers de navegador (intercepción de red, esperas por condición).",rules:["Contrato de tuplas: GET/DELETE → [respuesta, cuerpo]; POST/PUT/PATCH → [respuesta, cuerpo, payloadEnviado].","Fail-fast en público: si pides page sin fixture UI, UiBase lanza un error descriptivo."],chainNode:"ApiBase",samples:[{title:"tests/components/api/ApiBase.ts — apiPOST (fragmento)",sourcePath:"tests/components/api/ApiBase.ts",code:`protected async apiPOST<TBody, TPayload>(
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
`},{title:"tests/components/ui/UiBase.ts — el guardián fail-fast",sourcePath:"tests/components/ui/UiBase.ts",code:`get page(): Page {
  if (!this._page) {
    throw new Error(
      'Page is not available. UiBase requires a page instance. '
      + 'Make sure you are using a UI fixture (ui or test), not api.',
    );
  }
  return this._page;
}
`}]},{id:"contexto",level:"L1",name:"TestContext",tenants:"config · faker · entorno",role:"Los cimientos agnósticos: qué entorno, qué credenciales, qué datos falsos — sin nada de Playwright ni HTTP.",rules:["Agnóstico total: si mencionara Playwright o HTTP, ya no sería el cimiento.","Cada test genera sus propios datos (faker) — nada de estado compartido."],chainNode:"TestContext",samples:[{title:"tests/components/TestContext.ts — la clase completa",sourcePath:"tests/components/TestContext.ts",code:`export class TestContext {
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
`}]}],Be=["AuthApi","ApiBase","TestContext"];var qe=m('<span class="ext svelte-nu7zxe" aria-hidden="true">─extends→</span>'),Ue=m('<span class="chain-unit svelte-nu7zxe"><!> <code> </code></span>'),Ee=m('<button><span class="level svelte-nu7zxe"> </span> <span class="fname svelte-nu7zxe"> </span> <span class="tenants svelte-nu7zxe"> </span></button>'),Se=m('<div class="floor-slot svelte-nu7zxe"><button><span class="level svelte-nu7zxe"> </span> <span class="fname svelte-nu7zxe"> </span> <span class="tenants svelte-nu7zxe"> </span></button> <!></div>'),Fe=m('<li class="svelte-nu7zxe"> </li>'),Le=m('<article class="room svelte-nu7zxe"><header class="svelte-nu7zxe"><span class="tag svelte-nu7zxe"> </span> <h3 class="svelte-nu7zxe"> </h3></header> <p class="role svelte-nu7zxe"> </p> <ul class="blist svelte-nu7zxe"></ul> <!></article>'),Oe=m(`<div class="room-hint svelte-nu7zxe"><span class="hint-arrow svelte-nu7zxe" aria-hidden="true">←</span> <span class="hint-tap svelte-nu7zxe" aria-hidden="true">pulsa un piso ↑</span> <p class="svelte-nu7zxe">Elige un piso del edificio para entrar. Cada habitación muestra su rol, sus reglas y el
            código REAL del boilerplate que vive ahí.</p></div>`),$e=m(`<div class="chapter-body svelte-nu7zxe"><section class="intro svelte-nu7zxe"><p class="kicker svelte-nu7zxe">¿por qué capas?</p> <h2 class="svelte-nu7zxe">Un edificio donde cada piso tiene UN trabajo</h2> <p class="prose svelte-nu7zxe">KATA organiza el código de pruebas como un edificio. Cada piso es un <!> con una sola responsabilidad, y la regla de circulación es
      estricta: un piso superior usa al de abajo — nunca al revés. Los cimientos no saben nada de
      los tests; los tests lo saben todo de los cimientos.</p> <p class="prose svelte-nu7zxe">El ascensor entre pisos es la <!>: cada <!> de dominio nace encima de su base y recibe gratis todos sus <!> (<code class="svelte-nu7zxe">AuthApi extends ApiBase extends TestContext</code>).
      Y en la azotea, el <!> entrega el edificio entero, ya armado, a
      cada test. Elige un piso para entrar a su habitación.</p></section> <section class="tour svelte-nu7zxe"><div class="left svelte-nu7zxe"><div class="chain svelte-nu7zxe" aria-label="Cadena de herencia entre capas"><span class="chain-kicker svelte-nu7zxe">cadena de herencia</span> <div class="chain-row svelte-nu7zxe"></div></div> <div class="building svelte-nu7zxe" role="group" aria-label="El edificio KATA, piso por piso"><div class="roof svelte-nu7zxe" aria-hidden="true"></div> <!> <div class="ground svelte-nu7zxe" aria-hidden="true"></div></div></div> <div class="room-col svelte-nu7zxe" aria-live="polite"><!></div></section> <section class="svelte-nu7zxe"><div class="callout good svelte-nu7zxe"><strong class="svelte-nu7zxe">La regla de oro de dirección: una capa superior usa a la inferior, nunca al revés.</strong> TestContext no sabe qué es un test. ApiBase no sabe qué es AuthApi. Por eso, cambiar un piso
      de arriba jamás agrieta los cimientos.</div></section></div>`);function je(se,ae){Te(ae,!0);const j=typeof window<"u"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,p=e=>j?0:e;let g=ee(null);const v=R(()=>N.find(e=>e.id===t(g))??null),ne=R(()=>N.filter(e=>e.id!=="steps")),E=R(()=>N.find(e=>e.id==="steps"));let w=ee(null);function D(e){Z(g,t(g)===e?null:e,!0)}Ae(()=>{!t(v)||!t(w)||window.matchMedia("(max-width: 900px)").matches&&t(w).scrollIntoView({block:"start",behavior:j?"auto":"smooth"})});var H=$e(),S=s(H),M=a(s(S),4),oe=a(s(M));k(oe,{t:"módulo",children:(e,n)=>{var o=C("módulo");i(e,o)},$$slots:{default:!0}});var ie=a(M,2),G=a(s(ie));k(G,{t:"herencia",children:(e,n)=>{var o=C("herencia");i(e,o)},$$slots:{default:!0}});var J=a(G,2);k(J,{t:"clase",children:(e,n)=>{var o=C("clase");i(e,o)},$$slots:{default:!0}});var K=a(J,2);k(K,{t:"método",children:(e,n)=>{var o=C("métodos");i(e,o)},$$slots:{default:!0}});var re=a(K,4);k(re,{t:"fixture",children:(e,n)=>{var o=C("fixture");i(e,o)},$$slots:{default:!0}});var F=a(S,2),Q=s(F),V=s(Q),le=a(s(V),2);U(le,22,()=>Be,e=>e,(e,n,o)=>{var h=Ue(),r=s(h);{var f=d=>{var _=qe();i(d,_)};$(r,d=>{t(o)>0&&d(f)})}var x=a(r,2);let T;var A=s(x);P(()=>{var d;T=I(x,1,"node svelte-nu7zxe",null,T,{lit:((d=t(v))==null?void 0:d.chainNode)===n}),c(A,n)}),i(e,h)});var ce=a(V,2),de=a(s(ce),2);U(de,19,()=>t(ne),e=>e.id,(e,n,o)=>{var h=Se(),r=s(h);let f;var x=s(r),T=s(x),A=a(x,2),d=s(A),_=a(A,2),L=s(_),B=a(r,2);{var O=l=>{var u=Ee();let b;var q=s(u),xe=s(q),Y=a(q,2),me=s(Y),ge=a(Y,2),fe=s(ge);P(()=>{b=I(u,1,"floor mezzanine svelte-nu7zxe",null,b,{active:t(g)==="steps"}),te(u,"aria-pressed",t(g)==="steps"),c(xe,t(E).level),c(me,t(E).name),c(fe,t(E).tenants)}),W("click",u,()=>D("steps")),i(l,u)};$(B,l=>{t(n).id==="dominio"&&l(O)})}P(()=>{f=I(r,1,"floor svelte-nu7zxe",null,f,{active:t(g)===t(n).id}),te(r,"aria-pressed",t(g)===t(n).id),c(T,t(n).level),c(d,t(n).name),c(L,t(n).tenants)}),W("click",r,()=>D(t(n).id)),y(5,h,()=>z,()=>({y:-10,duration:p(350),delay:p(200+t(o)*90)})),i(e,h)});var X=a(Q,2),ue=s(X);{var pe=e=>{var n=be(),o=Ce(n);Pe(o,()=>t(v).id,h=>{var r=Le(),f=s(r),x=s(f),T=s(x),A=a(x,2),d=s(A),_=a(f,2),L=s(_),B=a(_,2);U(B,20,()=>t(v).rules,l=>l,(l,u)=>{var b=Fe(),q=s(b);P(()=>c(q,u)),i(l,b)});var O=a(B,2);U(O,17,()=>t(v).samples,l=>l.title,(l,u)=>{we(l,{get code(){return t(u).code},get title(){return t(u).title}})}),P(()=>{c(T,t(v).level),c(d,t(v).name),c(L,t(v).role)}),y(1,r,()=>z,()=>({x:18,duration:p(320)})),i(h,r)}),i(e,n)},ve=e=>{var n=Oe();y(3,n,()=>ze,()=>({duration:p(200)})),i(e,n)};$(ue,e=>{t(v)?e(pe):e(ve,-1)})}_e(X,e=>Z(w,e),()=>t(w));var he=a(F,2);y(5,S,()=>z,()=>({y:18,duration:p(450)})),y(5,F,()=>z,()=>({y:18,duration:p(450),delay:p(140)})),y(5,he,()=>z,()=>({y:18,duration:p(450),delay:p(260)})),i(se,H),ye()}ke(["click"]);export{je as default};
