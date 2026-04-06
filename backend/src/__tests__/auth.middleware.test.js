'use strict';

const jwt = require('jsonwebtoken');

// Seta variável de ambiente antes de importar o middleware
process.env.JWT_SECRET = 'test-secret-for-jest-only';

const auth = require('../middleware/auth');

function makeReqResMock(token, cookieToken) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: cookieToken ? { authToken: cookieToken } : {}
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
  const next = jest.fn();
  return { req, res, next };
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
}

describe('auth middleware', () => {
  describe('sem token', () => {
    it('retorna 401 quando não há token', () => {
      const { req, res, next } = makeReqResMock();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token não informado.' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('token via header Authorization', () => {
    it('chama next() com token válido', () => {
      const token = signToken({ sub: 'u1', role: 'ADMIN', email: 'a@test.com' });
      const { req, res, next } = makeReqResMock(token);
      auth()(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.sub).toBe('u1');
    });

    it('retorna 401 com token expirado', () => {
      const token = signToken({ sub: 'u1', role: 'ADMIN' }, { expiresIn: '-1s' });
      const { req, res, next } = makeReqResMock(token);
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('retorna 401 com token malformado', () => {
      const { req, res, next } = makeReqResMock('nao.e.um.token.valido');
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('retorna 401 com token assinado com secret errado', () => {
      const token = jwt.sign({ sub: 'u1', role: 'ADMIN' }, 'outro-secret');
      const { req, res, next } = makeReqResMock(token);
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('token via cookie httpOnly', () => {
    it('chama next() com cookie válido', () => {
      const token = signToken({ sub: 'u1', role: 'COLLECTOR', email: 'c@test.com' });
      const { req, res, next } = makeReqResMock(null, token);
      auth()(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('COLLECTOR');
    });
  });

  describe('verificação de papel (role)', () => {
    it('chama next() quando role está na lista permitida', () => {
      const token = signToken({ sub: 'u1', role: 'ADMIN' });
      const { req, res, next } = makeReqResMock(token);
      auth(['ADMIN'])(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('retorna 403 quando role não está na lista', () => {
      const token = signToken({ sub: 'u1', role: 'COLLECTOR' });
      const { req, res, next } = makeReqResMock(token);
      auth(['ADMIN'])(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('permite múltiplos roles', () => {
      const token = signToken({ sub: 'u1', role: 'COLLECTOR' });
      const { req, res, next } = makeReqResMock(token);
      auth(['ADMIN', 'COLLECTOR'])(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('sem lista de roles exige apenas autenticação', () => {
      const token = signToken({ sub: 'u1', role: 'COLLECTOR' });
      const { req, res, next } = makeReqResMock(token);
      auth()(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
