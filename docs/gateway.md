# Gateway

**Note:** Gateway is experimental and subject to change.

When running services locally it's often required to serve via a specific domain
like `denvig.local` instead of `localhost:3000`. Secure connections are also required
to integrate with some client side libraries such as login and payments.

Gateway solves this by configuring a local proxy infront of all denvig services
so you get a no config proxy based on your existing denvig services.


## Setup

```bash
brew install nginx mkcert
```

### Optional: Configure local certificates

If you want to use SSL locally then you will need valid certificates. You can either use a real domain (e.g. example.com) and issue
fully valid certficates, or you can setup a local CA just for your machine. If you don't already have the certificates, use `mkcert`
as described below.

```bash
mkcert -install

mkcert hello.denvig.localhost
mkdir -p certs/denvig.localhost
mv hello.denvig.localhost.pem certs/hello.denvig.localhost/cert.pem
mv hello.denvig.localhost-key.pem certs/hello.denvig.localhost/privkey.pem
```


## Internals

The current base for gateway is nginx (installed via homebrew). Nginx is a tried
and tested proxy so denvig can leverage that for a stable setup.

When running commands such as `denvig services start` it will generate the nginx
config based on the service definition and install it to the correct place.

### Configs

The primary nginx.conf is located at `code $(brew --prefix)/etc/nginx/nginx.conf` and
sub server configs can be created at code `$(brew --prefix)/etc/nginx/servers/*.conf`.
To simplify things, gateway genrates standard `server {}` blocks for each service in
the default directory to avoid conflicting with any other systems built on top of
nginx homebrew.

### Example Config

```conf
# denvig:
# slug: marcqualie/api
# path: ~/src/marcqualie/api
upstream denvig-{{project.id}}--{{service.id}} { server 127.0.0.1:4000 max_fails=0 fail_timeout=30; }
server {
  listen 80;
  listen 443 ssl;
  http2 on;
  server_name {{service.http.domain}};
  root {{project.path}}/public;
  index index.html;
  client_max_body_size 100M;

  # if certs are configured for a service they will be set here
  ssl_certificate {{project.path}}/certs/denvig.localhost/fullchain.pem;
  ssl_certificate_ke {{project.path}}/certs/denvig.localhost/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  location / {
    proxy_pass http://denvig-{{project.id}}-{{service.name}};
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect off;
    proxy_buffering off;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```
