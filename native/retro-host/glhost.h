// Headless OpenGL 3.2+ Core context + offscreen FBO + pixel readback for retrohost.
// Supports Windows (WGL), macOS (CGL), and Linux (EGL via dlopen) with zero external GL loader dependencies.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <GL/gl.h>
#define GLHOST_API APIENTRY
#elif defined(__APPLE__)
#include <dlfcn.h>
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#define GLHOST_API
#else
#include <dlfcn.h>
#define GLHOST_API
typedef unsigned int GLenum;
typedef unsigned int GLuint;
typedef int GLint;
typedef int GLsizei;
typedef unsigned char GLboolean;
typedef ptrdiff_t GLsizeiptr;
#ifndef GL_RGBA
#define GL_RGBA 0x1908
#endif
#ifndef GL_UNSIGNED_BYTE
#define GL_UNSIGNED_BYTE 0x1401
#endif
#ifndef GL_TEXTURE_2D
#define GL_TEXTURE_2D 0x0DE1
#endif
#ifndef GL_TEXTURE_MIN_FILTER
#define GL_TEXTURE_MIN_FILTER 0x2801
#endif
#ifndef GL_TEXTURE_MAG_FILTER
#define GL_TEXTURE_MAG_FILTER 0x2800
#endif
#ifndef GL_NEAREST
#define GL_NEAREST 0x2600
#endif
#ifndef GL_CLAMP_TO_EDGE
#define GL_CLAMP_TO_EDGE 0x812F
#endif
#ifndef GL_TEXTURE_WRAP_S
#define GL_TEXTURE_WRAP_S 0x2802
#endif
#ifndef GL_TEXTURE_WRAP_T
#define GL_TEXTURE_WRAP_T 0x2803
#endif
#ifndef GL_PACK_ALIGNMENT
#define GL_PACK_ALIGNMENT 0x0D05
#endif
#ifndef GL_PACK_ROW_LENGTH
#define GL_PACK_ROW_LENGTH 0x0D02
#endif
#endif

#ifndef GL_RGBA8
#define GL_RGBA8 0x8058
#endif
#ifndef GL_RGB
#define GL_RGB 0x1907
#endif
#ifndef GL_UNSIGNED_SHORT_5_6_5
#define GL_UNSIGNED_SHORT_5_6_5 0x8363
#endif
#ifndef GL_FRAMEBUFFER
#define GL_FRAMEBUFFER 0x8D40
#endif
#ifndef GL_READ_FRAMEBUFFER
#define GL_READ_FRAMEBUFFER 0x8CA8
#endif
#ifndef GL_RENDERBUFFER
#define GL_RENDERBUFFER 0x8D41
#endif
#ifndef GL_COLOR_ATTACHMENT0
#define GL_COLOR_ATTACHMENT0 0x8CE0
#endif
#ifndef GL_DEPTH_STENCIL_ATTACHMENT
#define GL_DEPTH_STENCIL_ATTACHMENT 0x821A
#endif
#ifndef GL_DEPTH_ATTACHMENT
#define GL_DEPTH_ATTACHMENT 0x8D00
#endif
#ifndef GL_DEPTH24_STENCIL8
#define GL_DEPTH24_STENCIL8 0x88F0
#endif
#ifndef GL_DEPTH_COMPONENT24
#define GL_DEPTH_COMPONENT24 0x81A6
#endif
#ifndef GL_FRAMEBUFFER_COMPLETE
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
#endif
#ifndef GL_CLAMP_TO_EDGE
#define GL_CLAMP_TO_EDGE 0x812F
#endif
#ifndef GL_TEXTURE_WRAP_S
#define GL_TEXTURE_WRAP_S 0x2802
#endif
#ifndef GL_TEXTURE_WRAP_T
#define GL_TEXTURE_WRAP_T 0x2803
#endif

static struct {
  bool ready;
  unsigned w, h;
  bool has_depth, has_stencil;
  GLuint fbo, color_tex, ds_rbo;
  uint8_t *scratch;
  size_t scratch_cap;
#ifdef _WIN32
  HWND hwnd;
  HDC hdc;
  HGLRC hglrc;
  HMODULE gl_dll;
#elif defined(__APPLE__)
  CGLContextObj ctx;
#else
  void *libegl;
  void *libgl;
  void *egl_dpy;
  void *egl_surf;
  void *egl_ctx;
  void *(GLHOST_API *egl_get_proc)(const char *);
  int (*egl_term)(void *);
  int (*egl_destroy_surf)(void *, void *);
  int (*egl_destroy_ctx)(void *, void *);
  int (*egl_make_cur)(void *, void *, void *, void *);
#endif
  void (GLHOST_API *pGenFramebuffers)(GLsizei, GLuint *);
  void (GLHOST_API *pBindFramebuffer)(GLenum, GLuint);
  void (GLHOST_API *pGenTextures)(GLsizei, GLuint *);
  void (GLHOST_API *pBindTexture)(GLenum, GLuint);
  void (GLHOST_API *pTexImage2D)(GLenum, GLint, GLint, GLsizei, GLsizei, GLint, GLenum, GLenum, const void *);
  void (GLHOST_API *pTexParameteri)(GLenum, GLenum, GLint);
  void (GLHOST_API *pFramebufferTexture2D)(GLenum, GLenum, GLenum, GLuint, GLint);
  void (GLHOST_API *pGenRenderbuffers)(GLsizei, GLuint *);
  void (GLHOST_API *pBindRenderbuffer)(GLenum, GLuint);
  void (GLHOST_API *pRenderbufferStorage)(GLenum, GLenum, GLsizei, GLsizei);
  void (GLHOST_API *pFramebufferRenderbuffer)(GLenum, GLenum, GLenum, GLuint);
  GLenum (GLHOST_API *pCheckFramebufferStatus)(GLenum);
  void (GLHOST_API *pDeleteFramebuffers)(GLsizei, const GLuint *);
  void (GLHOST_API *pDeleteTextures)(GLsizei, const GLuint *);
  void (GLHOST_API *pDeleteRenderbuffers)(GLsizei, const GLuint *);
  void (GLHOST_API *pReadPixels)(GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, void *);
  void (GLHOST_API *pPixelStorei)(GLenum, GLint);
} glh;

static void *glhost_proc(const char *name) {
  if (!name) return NULL;
#ifdef _WIN32
  void *p = (void *)wglGetProcAddress(name);
  if (!p || p == (void *)1 || p == (void *)2 || p == (void *)3 || p == (void *)-1) {
    if (!glh.gl_dll) glh.gl_dll = GetModuleHandleA("opengl32.dll");
    p = glh.gl_dll ? (void *)GetProcAddress(glh.gl_dll, name) : NULL;
  }
  return p;
#elif defined(__APPLE__)
  return dlsym(RTLD_DEFAULT, name);
#else
  void *p = glh.egl_get_proc ? glh.egl_get_proc(name) : NULL;
  if (!p && glh.libgl) p = dlsym(glh.libgl, name);
  return p;
#endif
}

static bool glhost_load_fns(void) {
#define GLF(field, name) do { glh.field = (void *)glhost_proc(name); if (!glh.field) return false; } while (0)
  GLF(pGenFramebuffers, "glGenFramebuffers");
  GLF(pBindFramebuffer, "glBindFramebuffer");
  GLF(pGenTextures, "glGenTextures");
  GLF(pBindTexture, "glBindTexture");
  GLF(pTexImage2D, "glTexImage2D");
  GLF(pTexParameteri, "glTexParameteri");
  GLF(pFramebufferTexture2D, "glFramebufferTexture2D");
  GLF(pGenRenderbuffers, "glGenRenderbuffers");
  GLF(pBindRenderbuffer, "glBindRenderbuffer");
  GLF(pRenderbufferStorage, "glRenderbufferStorage");
  GLF(pFramebufferRenderbuffer, "glFramebufferRenderbuffer");
  GLF(pCheckFramebufferStatus, "glCheckFramebufferStatus");
  GLF(pDeleteFramebuffers, "glDeleteFramebuffers");
  GLF(pDeleteTextures, "glDeleteTextures");
  GLF(pDeleteRenderbuffers, "glDeleteRenderbuffers");
  GLF(pReadPixels, "glReadPixels");
  GLF(pPixelStorei, "glPixelStorei");
#undef GLF
  return true;
}

static void glhost_destroy(void) {
  if (glh.ready) {
    if (glh.ds_rbo && glh.pDeleteRenderbuffers) glh.pDeleteRenderbuffers(1, &glh.ds_rbo);
    if (glh.color_tex && glh.pDeleteTextures) glh.pDeleteTextures(1, &glh.color_tex);
    if (glh.fbo && glh.pDeleteFramebuffers) glh.pDeleteFramebuffers(1, &glh.fbo);
  }
  glh.ds_rbo = glh.color_tex = glh.fbo = 0;
  glh.w = glh.h = 0;
  free(glh.scratch);
  glh.scratch = NULL;
  glh.scratch_cap = 0;
#ifdef _WIN32
  if (glh.hglrc) { wglMakeCurrent(NULL, NULL); wglDeleteContext(glh.hglrc); glh.hglrc = NULL; }
  if (glh.hdc && glh.hwnd) { ReleaseDC(glh.hwnd, glh.hdc); glh.hdc = NULL; }
  if (glh.hwnd) { DestroyWindow(glh.hwnd); glh.hwnd = NULL; }
#elif defined(__APPLE__)
  if (glh.ctx) { CGLSetCurrentContext(NULL); CGLDestroyContext(glh.ctx); glh.ctx = NULL; }
#else
  if (glh.egl_dpy && glh.egl_make_cur) glh.egl_make_cur(glh.egl_dpy, NULL, NULL, NULL);
  if (glh.egl_dpy && glh.egl_ctx && glh.egl_destroy_ctx) glh.egl_destroy_ctx(glh.egl_dpy, glh.egl_ctx);
  if (glh.egl_dpy && glh.egl_surf && glh.egl_destroy_surf) glh.egl_destroy_surf(glh.egl_dpy, glh.egl_surf);
  if (glh.egl_dpy && glh.egl_term) glh.egl_term(glh.egl_dpy);
  glh.egl_dpy = glh.egl_surf = glh.egl_ctx = NULL;
  if (glh.libgl) { dlclose(glh.libgl); glh.libgl = NULL; }
  if (glh.libegl) { dlclose(glh.libegl); glh.libegl = NULL; }
#endif
  glh.ready = false;
}

static bool glhost_init(unsigned major, unsigned minor, bool core_profile) {
  if (glh.ready) return true;
  if (!major) major = 3, minor = 2;
#ifdef _WIN32
  glh.hwnd = CreateWindowExA(0, "STATIC", "souldew-gl", WS_POPUP, 0, 0, 16, 16, NULL, NULL, GetModuleHandleA(NULL), NULL);
  if (!glh.hwnd) goto fail;
  glh.hdc = GetDC(glh.hwnd);
  if (!glh.hdc) goto fail;
  PIXELFORMATDESCRIPTOR pfd = { sizeof(pfd), 1, PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER, PFD_TYPE_RGBA, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 8, 0, PFD_MAIN_PLANE, 0, 0, 0, 0 };
  int pf = ChoosePixelFormat(glh.hdc, &pfd);
  if (!pf || !SetPixelFormat(glh.hdc, pf, &pfd)) goto fail;
  HGLRC tmp = wglCreateContext(glh.hdc);
  if (!tmp || !wglMakeCurrent(glh.hdc, tmp)) { if (tmp) wglDeleteContext(tmp); goto fail; }
  typedef HGLRC (WINAPI *PFNWGLCREATECONTEXTATTRIBSARBPROC)(HDC, HGLRC, const int *);
  PFNWGLCREATECONTEXTATTRIBSARBPROC create_ctx = (PFNWGLCREATECONTEXTATTRIBSARBPROC)(void *)wglGetProcAddress("wglCreateContextAttribsARB");
  if (create_ctx) {
    int attribs[] = {
      0x2091, (int)major,
      0x2092, (int)minor,
      0x9126, core_profile ? 0x0001 : 0x0002,
      0
    };
    HGLRC modern = create_ctx(glh.hdc, NULL, attribs);
    if (modern) {
      wglMakeCurrent(NULL, NULL);
      wglDeleteContext(tmp);
      if (!wglMakeCurrent(glh.hdc, modern)) { wglDeleteContext(modern); goto fail; }
      glh.hglrc = modern;
    } else {
      glh.hglrc = tmp;
    }
  } else {
    glh.hglrc = tmp;
  }
#elif defined(__APPLE__)
  (void)major; (void)minor; (void)core_profile;
  CGLPixelFormatAttribute attrs[] = {
    kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
    kCGLPFAColorSize, (CGLPixelFormatAttribute)24,
    kCGLPFAAlphaSize, (CGLPixelFormatAttribute)8,
    kCGLPFADepthSize, (CGLPixelFormatAttribute)24,
    kCGLPFAStencilSize, (CGLPixelFormatAttribute)8,
    kCGLPFAAccelerated,
    (CGLPixelFormatAttribute)0
  };
  CGLPixelFormatObj fmt = NULL;
  GLint npix = 0;
  if (CGLChoosePixelFormat(attrs, &fmt, &npix) != kCGLNoError || !fmt) {
    attrs[1] = (CGLPixelFormatAttribute)kCGLOGLPVersion_Legacy;
    if (CGLChoosePixelFormat(attrs, &fmt, &npix) != kCGLNoError || !fmt) goto fail;
  }
  CGLError err = CGLCreateContext(fmt, NULL, &glh.ctx);
  CGLDestroyPixelFormat(fmt);
  if (err != kCGLNoError || !glh.ctx) goto fail;
  if (CGLSetCurrentContext(glh.ctx) != kCGLNoError) goto fail;
#else
  glh.libegl = dlopen("libEGL.so.1", RTLD_NOW | RTLD_LOCAL);
  glh.libgl = dlopen("libGL.so.1", RTLD_NOW | RTLD_LOCAL);
  if (!glh.libegl || !glh.libgl) goto fail;
  void *(*get_dpy)(void *) = dlsym(glh.libegl, "eglGetDisplay");
  void *(*get_plat_dpy)(unsigned, void *, const intptr_t *) = dlsym(glh.libegl, "eglGetPlatformDisplay");
  int (*init_egl)(void *, int *, int *) = dlsym(glh.libegl, "eglInitialize");
  int (*bind_api)(unsigned) = dlsym(glh.libegl, "eglBindAPI");
  int (*choose_cfg)(void *, const int *, void **, int, int *) = dlsym(glh.libegl, "eglChooseConfig");
  void *(*create_pb)(void *, void *, const int *) = dlsym(glh.libegl, "eglCreatePbufferSurface");
  void *(*create_ctx)(void *, void *, void *, const int *) = dlsym(glh.libegl, "eglCreateContext");
  glh.egl_get_proc = dlsym(glh.libegl, "eglGetProcAddress");
  glh.egl_term = dlsym(glh.libegl, "eglTerminate");
  glh.egl_destroy_surf = dlsym(glh.libegl, "eglDestroySurface");
  glh.egl_destroy_ctx = dlsym(glh.libegl, "eglDestroyContext");
  glh.egl_make_cur = dlsym(glh.libegl, "eglMakeCurrent");
  if (!get_dpy || !init_egl || !bind_api || !choose_cfg || !create_pb || !create_ctx || !glh.egl_make_cur) goto fail;
  if (get_plat_dpy) glh.egl_dpy = get_plat_dpy(0x31DD, NULL, NULL); // EGL_PLATFORM_SURFACELESS_MESA
  if (!glh.egl_dpy) glh.egl_dpy = get_dpy(NULL);
  if (!glh.egl_dpy || !init_egl(glh.egl_dpy, NULL, NULL)) goto fail;
  if (!bind_api(0x30A2)) goto fail; // EGL_OPENGL_API
  int cfg_attr[] = { 0x3033, 0x0001, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3025, 24, 0x3026, 8, 0x3040, 0x0008, 0x3038 };
  void *cfg = NULL;
  int ncfg = 0;
  if (!choose_cfg(glh.egl_dpy, cfg_attr, &cfg, 1, &ncfg) || !ncfg) goto fail;
  int pb_attr[] = { 0x3057, 1, 0x3056, 1, 0x3038 };
  glh.egl_surf = create_pb(glh.egl_dpy, cfg, pb_attr);
  int ctx_attr[] = { 0x3098, (int)major, 0x30FB, (int)minor, 0x30FD, core_profile ? 0x0001 : 0x0002, 0x3038 };
  glh.egl_ctx = create_ctx(glh.egl_dpy, cfg, NULL, ctx_attr);
  if (!glh.egl_ctx || !glh.egl_make_cur(glh.egl_dpy, glh.egl_surf, glh.egl_surf, glh.egl_ctx)) goto fail;
#endif
  if (!glhost_load_fns()) goto fail;
  glh.ready = true;
  return true;
fail:
  glhost_destroy();
  return false;
}

static uintptr_t glhost_fbo(void) { return (uintptr_t)glh.fbo; }
static unsigned glhost_w(void) { return glh.w; }
static unsigned glhost_h(void) { return glh.h; }

static bool glhost_ensure_fbo(unsigned w, unsigned h, bool depth, bool stencil) {
  if (!glh.ready || !w || !h) return false;
  if (glh.fbo && glh.w == w && glh.h == h && glh.has_depth == depth && glh.has_stencil == stencil) return true;
  if (glh.ds_rbo) { glh.pDeleteRenderbuffers(1, &glh.ds_rbo); glh.ds_rbo = 0; }
  if (glh.color_tex) { glh.pDeleteTextures(1, &glh.color_tex); glh.color_tex = 0; }
  if (!glh.fbo) glh.pGenFramebuffers(1, &glh.fbo);
  glh.pBindFramebuffer(GL_FRAMEBUFFER, glh.fbo);

  glh.pGenTextures(1, &glh.color_tex);
  glh.pBindTexture(GL_TEXTURE_2D, glh.color_tex);
  glh.pTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, (GLsizei)w, (GLsizei)h, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
  glh.pTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glh.pTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glh.pTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glh.pTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glh.pFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, glh.color_tex, 0);

  if (depth || stencil) {
    glh.pGenRenderbuffers(1, &glh.ds_rbo);
    glh.pBindRenderbuffer(GL_RENDERBUFFER, glh.ds_rbo);
    glh.pRenderbufferStorage(GL_RENDERBUFFER, stencil ? GL_DEPTH24_STENCIL8 : GL_DEPTH_COMPONENT24, (GLsizei)w, (GLsizei)h);
    glh.pFramebufferRenderbuffer(GL_FRAMEBUFFER, stencil ? GL_DEPTH_STENCIL_ATTACHMENT : GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, glh.ds_rbo);
  }
  const GLenum st = glh.pCheckFramebufferStatus(GL_FRAMEBUFFER);
  glh.pBindFramebuffer(GL_FRAMEBUFFER, 0);
  if (st != GL_FRAMEBUFFER_COMPLETE) return false;
  glh.w = w;
  glh.h = h;
  glh.has_depth = depth;
  glh.has_stencil = stencil;
  return true;
}

static bool glhost_read(unsigned w, unsigned h, bool flip_y, uint8_t *dst) {
  if (!glh.ready || !glh.fbo || !w || !h || w > glh.w || h > glh.h || !dst) return false;
  glh.pBindFramebuffer(GL_READ_FRAMEBUFFER, glh.fbo);
  glh.pPixelStorei(GL_PACK_ALIGNMENT, 1);
  if (!flip_y) {
    glh.pReadPixels(0, 0, (GLsizei)w, (GLsizei)h, GL_RGBA, GL_UNSIGNED_BYTE, dst);
    return true;
  }
  const size_t row = (size_t)w * 4, need = row * h;
  if (need > glh.scratch_cap) {
    uint8_t *b = (uint8_t *)realloc(glh.scratch, need);
    if (!b) return false;
    glh.scratch = b;
    glh.scratch_cap = need;
  }
  glh.pReadPixels(0, 0, (GLsizei)w, (GLsizei)h, GL_RGBA, GL_UNSIGNED_BYTE, glh.scratch);
  for (unsigned y = 0; y < h; y++) memcpy(dst + (size_t)(h - 1 - y) * row, glh.scratch + (size_t)y * row, row);
  return true;
}

static bool glhost_read565(unsigned w, unsigned h, uint8_t *dst) {
  if (!glh.ready || !glh.fbo || !w || !h || w > glh.w || h > glh.h || !dst) return false;
  glh.pBindFramebuffer(GL_READ_FRAMEBUFFER, glh.fbo);
  glh.pPixelStorei(GL_PACK_ROW_LENGTH, 0);
#ifdef __APPLE__
  const size_t n = (size_t)w * h, need = n * 4;
  if (need > glh.scratch_cap) {
    uint8_t *b = (uint8_t *)realloc(glh.scratch, need);
    if (!b) return false;
    glh.scratch = b;
    glh.scratch_cap = need;
  }
  glh.pPixelStorei(GL_PACK_ALIGNMENT, 1);
  glh.pReadPixels(0, 0, (GLsizei)w, (GLsizei)h, GL_RGBA, GL_UNSIGNED_BYTE, glh.scratch);
  const uint8_t *s = glh.scratch;
  uint16_t *out = (uint16_t *)dst;
  for (size_t i = 0; i < n; i++, s += 4)
    out[i] = (uint16_t)(((s[0] & 0xF8) << 8) | ((s[1] & 0xFC) << 3) | (s[2] >> 3));
#else
  glh.pPixelStorei(GL_PACK_ALIGNMENT, 2);
  glh.pReadPixels(0, 0, (GLsizei)w, (GLsizei)h, GL_RGB, GL_UNSIGNED_SHORT_5_6_5, dst);
#endif
  return true;
}
