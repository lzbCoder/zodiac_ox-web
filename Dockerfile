FROM 123.56.74.230:5000/zodiac/nginx:1.21.1

COPY ./dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]