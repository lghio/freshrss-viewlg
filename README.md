# freshrss-viewlg
Extension for FreshRSS, display list of articles and pan for article content, theme colors


cd /docker-data/freshrss/www/freshrss/extensions/xExtension-ViewLG
rm -rf ..?* .[!.]* *
docker run --rm -v $(pwd):/target alpine/git clone https://github.com/lghio/freshrss-viewlg.git /target
chown -R 1000:users .


Here is the best way to update the extension on your server without having to delete and re-clone everything:

1. On your local machine (in VS Code):
Make sure to commit and push your recent changes to GitHub:

git add .
git commit -m "Fix proxy 500 errors and update CSP"
git push

2. On your server:
Instead of removing the files and cloning from scratch, you can use the same alpine/git Docker image to simply pull the latest changes:

cd /docker-data/freshrss/www/freshrss/extensions/xExtension-ViewLG
docker run --rm -v $(pwd):/target alpine/git -c safe.directory=/target -C /target pull
chown -R 1000:users .


Alternatively (The Wipe & Re-clone Method)
If you prefer to start completely fresh just like you did the first time (which is also perfectly fine and ensures no overlapping files), you can run your exact original install script again:

cd /docker-data/freshrss/www/freshrss/extensions/xExtension-ViewLG
rm -rf ..?* .[!.]* *
docker run --rm -v $(pwd):/target alpine/git clone https://github.com/lghio/freshrss-viewlg.git /target
chown -R 1000:users .

