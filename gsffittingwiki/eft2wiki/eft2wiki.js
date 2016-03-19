(function () {
    'use strict';

    var eftForm = document.getElementById('eftForm');
    var inputTextarea = document.getElementById('efttextarea');

    var EFT_SECTIONS = [
        [
            'name',
            'low',
            'med',
            'high',
            'rig',
            'sub'
        ],
        [
            'drone'
        ],
        [
            'implant'
        ],
        [
            'cargo'
        ]
    ];


    class ItemPromise {
        constructor(requestName) {
            this.requestName = requestName;
            this.result = null;

            this.promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            });

            this.promise.then((result) => {
                console.log(result);
                this.result = result;
            });
        }

        then(...args) {
            return this.promise.then(...args);
        }

        catch(...args) {
            return this.promise.then(...args);
        }
    }

    class TypeNameToTypeIDResolver {
        constructor() {
            this.itemPromises = new Map();
        }

        get(typeName) {
            if (typeName === null) {
                return null;
            }

            if (!this.itemPromises.has(typeName)) {
                this.itemPromises.set(typeName, new ItemPromise(typeName));
            }

            return this.itemPromises.get(typeName);
        }

        doFetch() {
            let names = '';
            for (let k of this.itemPromises.keys()) {
                names = names + '|' + k
            }

            names = names.substr(1, names.length - 1);

            fetch('http://micro.evetoolkit.net/api/nameToID?names=' + names)
                .then(this.fetchResolved.bind(this))
                .then(this.contentResolved.bind(this))
                .catch(function (ex) {
                    console.log('parsing failed', ex)
                })
        }

        fetchResolved(response) {
            if (response.status === 200) {
                return response.json();
            } else {
                for (let p of this.itemPromises.values()) {
                    p.reject();
                }
            }
        }

        contentResolved(types) {
            for (let t of types) {
                let p = this.itemPromises.get(t.typeName);
                if (p) {
                    p.resolve(t);
                    this.itemPromises.delete(t.typeName);
                }
            }

            for (let v of this.itemPromises.values()) {
                v.reject('Not Found');
            }

            this.itemPromises.clear();
        }

        *unresolved() {
            for (let itemPromise of this.itemPromises.values()) {
                yield itemPromise.promise;
            }
        }

        all() {
            return Promise.all(this.unresolved());
        }
    }

    function startProcessEFT(event) {
        event.preventDefault();

        let inputs = Array.from(eftForm.querySelectorAll('textarea'))
            .concat(Array.from(eftForm.querySelectorAll('input')))
            .concat(Array.from(eftForm.querySelectorAll('button')));

        for (let t of inputs) {
            t.disabled = true;
        }

        parseEFT(inputTextarea.value);
    }


    function parseEFT(eft) {
        var resolver = new TypeNameToTypeIDResolver();

        var lines = eft.split('\n');

        var fit = {
            'name': '',
            'ship': '',
            'high': [],
            'med': [],
            'low': [],
            'rig': [],
            'sub': [],
            'drone': [],
            'implant': [],
            'charge': [],
            'cargo': []
        };

        var state_a = 0,
            state_b = 0;

        var prevLineBlank = false;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            if (line === '') {
                if (prevLineBlank) {
                    state_a++;
                    state_b = 0;
                } else {
                    state_b++;
                }
                prevLineBlank = true;
                continue;
            } else {
                prevLineBlank = false;
            }


            let bits = [];
            switch (EFT_SECTIONS[state_a][state_b]) {
                case 'name':
                    // remove leading an trailing []
                    line = line.substr(1, line.length - 2);
                    bits = line.split(',');

                    fit.ship = resolver.get(bits[0]);
                    fit.name = bits[1].trim();

                    break;
                case 'high':
                case 'med':
                case 'low':
                    bits = line.split(',');

                    let charge = null;
                    if (bits.length > 1) {
                        charge = bits[1].trim();
                    }

                    fit[EFT_SECTIONS[state_a][state_b]].push(resolver.get(bits[0]));
                    if (charge != null) {
                        fit['charge'].push(resolver.get(charge))
                    }

                    break;
                case 'drone':
                case 'cargo':
                    bits = line.match(/^(.*?)( x[0-9]+)?$/);

                    let qty = null;
                    if (bits[2]) {
                        let qtyStr = bits[2];
                        qty = parseInt(qtyStr.substr(2, qtyStr.length - 1));
                    }

                    fit[EFT_SECTIONS[state_a][state_b]].push({
                        'item': resolver.get(bits[1]),
                        'qty': qty
                    });

                    break;
                default:
                    fit[EFT_SECTIONS[state_a][state_b]].push(resolver.get(line));
            }
        }

        resolver.doFetch();

        resolver.all().then(
            (value) => {
                console.log(value);
                outputWiki(fit);
            },
            (err) => {
                console.log(err)
            }
        );
    }

    function outputWiki(fit) {
        var output = `{{#widget:ShipFitting
| ship=${fit.ship.result.typeName}
| shipTypeID=${fit.ship.result.typeID}
| fitName=${fit.name}\n`;

        for (let i = 0; i < fit.high.length; i++) {
            let item = fit.high[i];
            output += `| high${i + 1}name=${item.result.typeName}
| high${i + 1}typeID=${item.result.typeID}\n`
        }
        for (let i = 0; i < fit.med.length; i++) {
            let item = fit.med[i];
            output += `| mid${i + 1}name=${item.result.typeName}
| mid${i + 1}typeID=${item.result.typeID}\n`
        }
        for (let i = 0; i < fit.low.length; i++) {
            let item = fit.low[i];
            output += `| low${i + 1}name=${item.result.typeName}
| low${i + 1}typeID=${item.result.typeID}\n`
        }

        for (let i = 0; i < fit.sub.length; i++) {
            let item = fit.sub[i];
            output += `| subsystem${i + 1}name=${item.result.typeName}
| subsystem${i + 1}typeID=${item.result.typeID}\n`
        }

        for (let i = 0; i < fit.rig.length; i++) {
            let item = fit.rig[i];
            output += `| rig${i + 1}name=${item.result.typeName}
| rig${i + 1}typeID=${item.result.typeID}\n`
        }

        for (let i = 0; i < fit.drone.length; i++) {
            let item = fit.drone[i].item;
            output += `| drone${i + 1}name=${item.result.typeName}
| drone${i + 1}typeID=${item.result.typeID}\n`
        }

        var charges = [];
        for (let i = 0; i < fit.charge.length; i++) {
            let item = fit.charge[i];
            if (charges.indexOf(item.result.typeName) < 0) {
                output += `| charge${i + 1}name=${item.result.typeName}
| charge${i + 1}typeID=${item.result.typeID}\n`

                charges.push(item.result.typeName);
            }
        }

        var difficultyElm = document.getElementById('difficulty');
        var difficulty = difficultyElm.options[difficultyElm.selectedIndex].value;
        var version = document.getElementById('version').value;

        output += `| difficulty=${difficulty}\n`;
        output += `| version=${version}\n`;

        var group1name = document.getElementById('group_1_name').value;
        var group1icon = document.getElementById('group_1_icon').value;
        var group2name = document.getElementById('group_2_name').value;
        var group2icon = document.getElementById('group_2_icon').value;
        var group3name = document.getElementById('group_3_name').value;
        var group3icon = document.getElementById('group_3_icon').value;
        var group4name = document.getElementById('group_4_name').value;
        var group4icon = document.getElementById('group_4_icon').value;

        if (group1name) {
            output += `| group.${group1name}=${group1icon}\n`;
        }
        if (group2name) {
            output += `| group.${group2name}=${group2icon}\n`;
        }
        if (group3name) {
            output += `| group.${group3name}=${group3icon}\n`;
        }
        if (group4name) {
            output += `| group.${group4name}=${group4icon}\n`;
        }

        var notes = document.getElementById('notes').value;

        output += `| notes=${notes}\n`;

        var cargo = '';
        for (let i = 0; i < fit.drone.length; i++) {
            let item = fit.drone[i];
            cargo += `${item.item.result.typeName} x${item.qty}\n`;
        }
        if (cargo === '') {
            cargo = '\n';
        }

        output += `| cargo=${cargo}`;
        output += '}}';

        let o = document.getElementsByTagName('output')[0];
        o.innerText = output;
    }


    eftForm.addEventListener('submit', startProcessEFT);

})();