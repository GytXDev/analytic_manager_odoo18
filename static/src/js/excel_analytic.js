/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class ExcelAnalytic extends Component {
    static template = 'owl.ExcelAnalytic';


    setup() {
        this.action = useService("action");

        onMounted(async () => {
        });
    }
   
}

registry.category('actions').add('excel_analytic', ExcelAnalytic);
