# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
import io
import xlsxwriter

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique'

    # ===============================
    # 1) Champs de base
    # ===============================
    name = fields.Many2one(
        'account.analytic.account',
        string="Code Projet",
        required=True,
        help="Sélectionnez le compte analytique associé au projet.",
        domain=[('code', '!=', False)]
    )
    code_projet = fields.Char(
        string="Code Projet",
        related="name.name",
        store=False,
        readonly=True
    )
    libelle = fields.Char("Libellé")
    date = fields.Date(
        'Date',
        required=True,
        index=True,
        default=fields.Date.context_today,
    )
    plan_id = fields.Many2one(
        comodel_name='account.analytic.plan',
        string="Plan Analytique",
    )

    marche_initial = fields.Float("Marché Initial")
    ts = fields.Float("Travaux Supplémentaires")

    factures_cumulees = fields.Float("Factures Cumulées", compute='_compute_factures_cumulees')
    non_facture = fields.Float("Non Facturé")
    depenses_cumulees = fields.Float("Dépenses Cumulées", compute='_compute_depenses_cumulees')
    debours_previsionnels = fields.Float("Débours Prévisionnels")
    debours_comptable_cumule = fields.Float("Débours comptable Cumulé", compute='_compute_debours_comptable_cumule')
    total_debourses = fields.Float("Total Déboursés", compute='_compute_total_debourses')
    trop_facture = fields.Float("Trop Facturé", compute='_compute_trop_facture')

    od_facture = fields.Float("Opérations Diverses Facturées")
    oda_d = fields.Float("Ordres Divers d'Achats Décaissés")
    ffnp = fields.Float("Factures Fournisseurs Non Parvenues")
    stocks = fields.Float("Stocks")
    provisions = fields.Float("Provisions")

    ca_final = fields.Float("CA Final (FCFA)", compute='_compute_ca_final', store=False)
    activite_cumulee = fields.Float("Activité Cumulée (FCFA)", compute='_compute_activite_cumulee', store=False)

    pourcentage_avancement = fields.Float(
        string="Avancement (%)",
        compute='_compute_pourcentage_avancement',
        store=False  # Calcul dynamique, pas recherché en SQL
    )
    pourcentage_avancement_stored = fields.Float(
        string="Avancement (%) (Stocké)",
        compute='_compute_pourcentage_avancement',
        store=True   # Permet le 'search' sur ce champ
    )
    resultat_chantier_cumule = fields.Float(
        string="Résultat Chantier Cumulé",
        compute='_compute_resultat_chantier_cumule',
        store=False
    )

    _sql_constraints = [
        ('unique_analytic_account', 'unique(name)', 'Un tableau analytique existe déjà pour ce projet !')
    ]

    # ===============================
    # 2) Création & onchange
    # ===============================
    @api.model
    def create(self, vals):
        if 'name' in vals:
            existing_dashboard = self.search([('name', '=', vals['name'])])
            if existing_dashboard:
                raise ValidationError(_('Une analyse analytique existe déjà pour ce projet !'))
        return super(AnalyticDashboard, self).create(vals)

    @api.onchange('name')
    def _onchange_name(self):
        """
        Met à jour automatiquement les champs 'libelle' et 'plan_id'
        en fonction du compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                record.libelle = record.name.code
                record.plan_id = record.name.plan_id
            else:
                record.libelle = False
                record.plan_id = False

    def create_dashboard_for_all_analytic_accounts(self):
        """
        Crée automatiquement un tableau de bord pour chaque compte analytique
        n'en ayant pas déjà.
        """
        analytic_accounts = self.env['account.analytic.account'].search([])
        created_count = 0
        for account in analytic_accounts:
            existing_dashboard = self.search([('name', '=', account.id)])
            if not existing_dashboard:
                self.create({
                    'name': account.id,
                    'libelle': account.code,
                    'plan_id': account.plan_id.id,
                })
                created_count += 1
        if created_count > 0:
            return f"{created_count} Code projets créé(s)"
        else:
            return "Le tableau de bord est déjà à jour."

    # ===============================
    # 3) Compute "standard" non filtré
    # ===============================
    @api.depends('marche_initial', 'ts')
    def _compute_ca_final(self):
        for record in self:
            record.ca_final = round((record.marche_initial or 0) + (record.ts or 0), 2)

    @api.depends('name')
    def _compute_debours_comptable_cumule(self):
        """
        Calcule la somme des factures fournisseurs (HT) + avoirs
        (in_invoice, in_refund) pour ce projet (sans filtrer invoice_date).
        """
        for record in self:
            if record.name:
                move_lines = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['in_invoice', 'in_refund']),
                    ('move_id.state', '=', 'posted')
                ])
                move_ids = move_lines.mapped('move_id')
                total_in_invoices = sum(m.amount_untaxed_in_currency_signed
                                        for m in move_ids if m.move_type == 'in_invoice')
                total_in_refunds = sum(m.amount_untaxed_in_currency_signed
                                       for m in move_ids if m.move_type == 'in_refund')
                record.debours_comptable_cumule = total_in_invoices + total_in_refunds
            else:
                record.debours_comptable_cumule = 0.0

    @api.depends('debours_comptable_cumule', 'oda_d', 'ffnp', 'stocks', 'provisions')
    def _compute_depenses_cumulees(self):
        """
        Dépenses cumulées = Deb Compta Cumulées + ODA D + Fact. Four. Non Parvenues + Stocks + Provisions
        (sans date filtrée).
        """
        for record in self:
            record.depenses_cumulees = round(
                (record.debours_comptable_cumule or 0)
                + (record.oda_d or 0)
                + (record.ffnp or 0)
                + (record.stocks or 0)
                + (record.provisions or 0),
                2
            )

    @api.depends('depenses_cumulees')
    def _compute_total_debourses(self):
        for record in self:
            record.total_debourses = record.depenses_cumulees

    @api.depends('name')
    def _compute_factures_cumulees(self):
        """
        Calcule le total (HT) des factures clients (out_invoice) & avoirs (out_refund),
        sans filtrage invoice_date.
        """
        for record in self:
            if record.name:
                move_lines = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['out_invoice', 'out_refund']),
                    ('move_id.state', '=', 'posted')
                ])
                move_ids = move_lines.mapped('move_id')
                total_out_invoices = sum(m.amount_untaxed_in_currency_signed
                                         for m in move_ids if m.move_type == 'out_invoice')
                total_out_refunds = sum(m.amount_untaxed_in_currency_signed
                                        for m in move_ids if m.move_type == 'out_refund')
                record.factures_cumulees = (total_out_invoices + total_out_refunds)
            else:
                record.factures_cumulees = 0.0

    @api.depends('factures_cumulees', 'od_facture', 'non_facture', 'trop_facture')
    def _compute_activite_cumulee(self):
        for record in self:
            record.activite_cumulee = round(
                (record.factures_cumulees or 0)
                + (record.od_facture or 0)
                + (record.non_facture or 0)
                + (record.trop_facture or 0),
                2
            )

    @api.depends('debours_comptable_cumule', 'oda_d', 'ca_final',
                 'total_debourses', 'depenses_cumulees', 'factures_cumulees', 'od_facture')
    def _compute_trop_facture(self):
        """
        Calcule la "Trop Facturé" de manière custom (ex: basé sur un ratio).
        """
        for record in self:
            if record.debours_previsionnels == 0 or record.total_debourses == 0 or record.factures_cumulees == 0:
                record.trop_facture = 0.0
            else:
                total_debourses_previsionnels = record.total_debourses - record.debours_previsionnels
                if total_debourses_previsionnels != 0:
                    val = (record.ca_final * (record.total_debourses / total_debourses_previsionnels)) \
                           - record.factures_cumulees - record.od_facture
                    if val > 0:
                        record.trop_facture = 0.0
                    else:
                        record.trop_facture = val
                else:
                    record.trop_facture = 0.0

    @api.depends('activite_cumulee', 'depenses_cumulees')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            if record.activite_cumulee is None or record.depenses_cumulees is None:
                record.resultat_chantier_cumule = 0.0
            else:
                record.resultat_chantier_cumule = round(
                    record.activite_cumulee + record.depenses_cumulees,
                    2
                )

    @api.depends('activite_cumulee', 'ca_final')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.ca_final and record.activite_cumulee:
                val = (record.activite_cumulee or 0) / record.ca_final
                record.pourcentage_avancement = round(val, 2)
                record.pourcentage_avancement_stored = round(val, 2)
            else:
                record.pourcentage_avancement = 0.0
                record.pourcentage_avancement_stored = 0.0

    # ===============================
    # 4) Méthodes "périodisées"
    # ===============================
    def _factures_cumulees_periodise(self, start, end):
        """
        Montant (HT) factures clients (out_invoice / out_refund)
        pour CE projet, filtré par invoice_date ∈ [start, end].
        """
        if not self.name:
            return 0.0

        domain = [
            ('analytic_distribution', 'in', [self.name.id]),
            ('move_id.move_type', 'in', ['out_invoice', 'out_refund']),
            ('move_id.state', '=', 'posted'),
        ]
        if start:
            domain.append(('move_id.invoice_date', '>=', start))
        if end:
            domain.append(('move_id.invoice_date', '<=', end))

        lines = self.env['account.move.line'].search(domain)
        moves = lines.mapped('move_id')

        total_invoices = sum(m.amount_untaxed_in_currency_signed for m in moves if m.move_type == 'out_invoice')
        total_refunds = sum(m.amount_untaxed_in_currency_signed for m in moves if m.move_type == 'out_refund')
        return total_invoices + total_refunds

    def _debours_comptable_periodise(self, start, end):
        """
        Montant (HT) factures fournisseurs (in_invoice / in_refund)
        pour CE projet, filtré par invoice_date ∈ [start, end].
        """
        if not self.name:
            return 0.0

        domain = [
            ('analytic_distribution', 'in', [self.name.id]),
            ('move_id.move_type', 'in', ['in_invoice', 'in_refund']),
            ('move_id.state', '=', 'posted'),
        ]
        if start:
            domain.append(('move_id.invoice_date', '>=', start))
        if end:
            domain.append(('move_id.invoice_date', '<=', end))

        lines = self.env['account.move.line'].search(domain)
        moves = lines.mapped('move_id')

        total_in_invoices = sum(m.amount_untaxed_in_currency_signed for m in moves if m.move_type == 'in_invoice')
        total_in_refunds = sum(m.amount_untaxed_in_currency_signed for m in moves if m.move_type == 'in_refund')
        return total_in_invoices + total_in_refunds

    def get_projets_periodises(self, start=None, end=None, plan_id=None):
        """
        Retourne un tableau de dicts pour chaque projet filtré par plan_id,
        avec des calculs "périodisés" (invoice_date ∈ [start, end]).
        """
        domain = []
        if plan_id:
            domain.append(('plan_id', '=', plan_id))

        dashboards = self.search(domain)
        data = []
        for dash in dashboards:
            # Factures cumulées filtrées
            fact_cumul = dash._factures_cumulees_periodise(start, end)
            # Débours fournisseurs filtrés
            debours_cumul = dash._debours_comptable_periodise(start, end)

            # On reconstitue la "dépense" + "activité"
            depenses = debours_cumul + dash.oda_d + dash.ffnp + dash.stocks + dash.provisions
            ca_fin = (dash.marche_initial + dash.ts)
            activite = fact_cumul + dash.od_facture + dash.non_facture + dash.trop_facture
            result_chant = activite + depenses

            avancement = 0.0
            if ca_fin:
                avancement = round(activite / ca_fin, 2)

            data.append({
                'id_code_project': dash.name.id,
                'code_projet': dash.name.name or '',
                'libelle': dash.libelle or '',
                'plan_id': dash.plan_id.id if dash.plan_id else False,
                'date': dash.date,  # date de l'enregistrement
                'marche_initial': dash.marche_initial,
                'ts': dash.ts,
                'od_facture': dash.od_facture,
                'oda_d': dash.oda_d,
                'ffnp': dash.ffnp,
                'stocks': dash.stocks,
                'provisions': dash.provisions,
                'non_facture': dash.non_facture,
                'trop_facture': dash.trop_facture,

                'factures_cumulees': fact_cumul,
                'debours_comptable_cumule': debours_cumul,
                'depenses_cumulees': depenses,
                'activite_cumulee': activite,
                'ca_final': ca_fin,
                'resultat_chantier_cumule': result_chant,
                'pourcentage_avancement': avancement,
            })
        return data

    # ===============================
    # 5) Plans & Totaux
    # ===============================
    def get_totals_for_plan(self, plan_id):
        """
        Version standard (non filtrée).
        Retourne des totaux sur un plan.
        """
        projets = self.search([('plan_id', '=', plan_id)])
        resultat_chantier_cumule = sum(p.resultat_chantier_cumule for p in projets)
        activite_cumulee = sum(p.activite_cumulee for p in projets)
        depenses_cumulees = sum(p.depenses_cumulees for p in projets)
        factures_cumulees = sum(p.factures_cumulees for p in projets)
        return {
            'resultat_chantier_cumule': resultat_chantier_cumule,
            'activite_cumulee': activite_cumulee,
            'depenses_cumulees': depenses_cumulees,
            'factures_cumulees': factures_cumulees,
        }

    @api.model
    def get_all_plans(self):
        """
        Retourne seulement les plans qui ont des projets (version standard).
        """
        plans = self.env['account.analytic.plan'].search([
            '|',
            ('parent_id', '!=', False),
            ('children_ids', '=', False),
        ])
        plans_data = []
        for plan in plans:
            projets_count = self.search_count([('plan_id', '=', plan.id)])
            if projets_count > 0:
                totals = self.get_totals_for_plan(plan.id)
                plans_data.append({
                    'id': plan.id,
                    'name': plan.name,
                    'resultat_chantier_cumule': totals['resultat_chantier_cumule'],
                    'activite_cumulee': totals['activite_cumulee'],
                    'depenses_cumulees': totals['depenses_cumulees'],
                    'factures_cumulees': totals['factures_cumulees'],
                })
        return {
            'count': len(plans_data),
            'plans': plans_data,
        }

    # ===============================
    # 6) Statistiques & indicateurs
    # ===============================
    @api.model
    def get_resultat_chantier_total(self, start_date=None, end_date=None):
        """
        Version standard, filtrée sur record.date (pas invoice_date).
        """
        domain = []
        if start_date:
            domain.append(('date', '>=', start_date))
        if end_date:
            domain.append(('date', '<=', end_date))

        total = sum(self.search(domain).mapped('resultat_chantier_cumule'))
        return {'resultat_chantier_total': total}

    @api.model
    def get_progression_moyenne(self, start_date=None, end_date=None):
        """
        Pareil, version standard, filtrée sur record.date.
        """
        domain = []
        if start_date:
            domain.append(('date', '>=', start_date))
        if end_date:
            domain.append(('date', '<=', end_date))

        progression = self.search(domain).mapped('pourcentage_avancement')
        if progression:
            return {'progression_moyenne': sum(progression) / len(progression)}
        return {'progression_moyenne': 0}

    def get_statistiques_projets(self):
        """
        Sans filtrage: on calcule la taille, total chantier, progression
        via get_resultat_chantier_total_periodise() (qui appelle la version "périodisée" sans date).
        """
        total_projets = len(self.search([]))
        total_result = self.get_resultat_chantier_total_periodise()  # => pas de date => all
        avg_progress = self.get_progression_moyenne_periodise()
        return {
            'total_projets': total_projets,
            'resultat_chantier_total': total_result,
            'progression_moyenne': avg_progress,
        }

    # ===============================
    # 7) Période "périodisée" -> RPC
    # ===============================
    def get_resultat_chantier_total_periodise(self, start=None, end=None):
        """
        Somme du 'resultat_chantier_cumule' calculé par la logique "périodisée"
        (factures & dépenses filtrées).
        """
        data = self.get_projets_periodises(start, end)
        return sum(d['resultat_chantier_cumule'] for d in data)

    def get_progression_moyenne_periodise(self, start=None, end=None):
        """
        Moyenne du 'pourcentage_avancement' calculé par la logique "périodisée".
        """
        data = self.get_projets_periodises(start, end)
        if not data:
            return 0.0
        return sum(d['pourcentage_avancement'] for d in data) / len(data)

    # ===============================
    # 8) Opérations CRUD: projets
    # ===============================
    def update_project(self, project_id, values):
        project = self.search([('name.id', '=', project_id)], limit=1)
        if project:
            project.write(values)
            return {'status': 'success', 'message': 'Projet mis à jour avec succès'}
        else:
            return {'status': 'error', 'message': 'Projet non trouvé'}

    def update_all_projects(self, values):
        projects = self.search([])
        if projects:
            projects.write(values)
            return {'status': 'success', 'message': 'Tous les projets ont été mis à jour avec succès'}
        else:
            return {'status': 'error', 'message': 'Aucun projet trouvé'}

    # ===============================
    # 9) Récupération non filtrée
    # ===============================
    def get_all_projets(self, plan_id=None):
        """
        Retourne la liste des projets standard (sans période).
        """
        domain = []
        if plan_id:
            domain.append(('plan_id', '=', plan_id))

        projets = self.search(domain)
        projets_data = []
        for p in projets:
            projets_data.append({
                'id_code_project': p.name.id,
                'code_projet': p.name.name,
                'libelle': p.libelle,
                'marche_initial': p.marche_initial,
                'ts': p.ts,
                'pourcentage_avancement': p.pourcentage_avancement,
                'resultat_chantier_cumule': p.resultat_chantier_cumule,
                'ca_final': p.ca_final,
                'date': p.date,
                'plan_id': p.plan_id.id,
                'trop_facture': p.trop_facture,
                'factures_cumulees': p.factures_cumulees,
                'depenses_cumulees': p.depenses_cumulees,
                'activite_cumulee': p.activite_cumulee,
                'non_facture': p.non_facture,
                'od_facture': p.od_facture,
                'oda_d': p.oda_d,
                'ffnp': p.ffnp,
                'stocks': p.stocks,
                'provisions': p.provisions,
                'total_debourses': p.total_debourses,
                'debours_previsionnels': p.debours_previsionnels,
                'debours_comptable_cumule': p.debours_comptable_cumule,
            })
        return projets_data

    def get_donnees_projets_independantes(self, plan_id=None):
        """
        Variante pour usage JSON / Contrôleurs: renvoie la même chose.
        """
        projets = self.get_all_projets(plan_id)
        projets_donnees = []
        for p in projets:
            projets_donnees.append({
                'id_code_project': p['id_code_project'],
                'code_projet': p['code_projet'],
                'libelle': p['libelle'] or 'Non renseigné',
                'marche_initial': p['marche_initial'] or 0,
                'ts': p['ts'] or 0,
                'pourcentage_avancement': p['pourcentage_avancement'] or 0,
                'resultat_chantier_cumule': p['resultat_chantier_cumule'] or 0,
                'ca_final': p['ca_final'] or 0,
                'date': p['date'],
                'plan_id': p['plan_id'],
                'trop_facture': p['trop_facture'],
                'factures_cumulees': p['factures_cumulees'] or 0,
                'depenses_cumulees': p['depenses_cumulees'] or 0,
                'activite_cumulee': p['activite_cumulee'] or 0,
                'od_facture': p['od_facture'],
                'non_facture': p['non_facture'] or 0,
                'oda_d': p['oda_d'] or 0,
                'ffnp': p['ffnp'] or 0,
                'stocks': p['stocks'] or 0,
                'provisions': p['provisions'] or 0,
                'total_debourses': p['total_debourses'] or 0,
                'debours_previsionnels': p['debours_previsionnels'] or 0,
                'debours_comptable_cumule': p['debours_comptable_cumule'] or 0,
            })
        return projets_donnees

    # ===============================
    # 10) Export Excel
    # ===============================
    def export_to_excel(self):
        """
        Génère un fichier Excel avec les données des projets, regroupés par plan,
        puis un bloc récap "Activité Cumulée, PLAN, %"...
        """
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet()

        header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#138d75',
            'font_color': 'white',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        cell_format = workbook.add_format({
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        highlight_format = workbook.add_format({
            'bg_color': 'yellow',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        lowlight_format = workbook.add_format({
            'bg_color': '#5dade2',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        total_format = workbook.add_format({
            'bold': True,
            'bg_color': '#f9f9f9',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        red_format = workbook.add_format({
            'font_color': 'red',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })

        headers = [
            'Code Projet', 'Libellé', 'Marché Initial', 'TS', 'CA Final',
            'Fact Comptable Cumulées', 'OD Facture', 'Non Facturé',
            'Trop Facturé', 'Activité Cumulée', '%avt',
            'Débours Comptable Cumulé', 'ODA D', 'FFNP', 'Stocks',
            'Provisions', 'Total Déboursés', 'Dépenses Cumulées',
            'Débours Prévisionnels', 'Resultat Chantier'
        ]

        plans = self.env['account.analytic.plan'].search([])
        row_num = 0

        for plan in plans:
            # Titre
            worksheet.merge_range(row_num, 0, row_num, len(headers) - 1, f"Exploitation: {plan.name}", total_format)
            row_num += 2

            # En-têtes
            for col_num, header in enumerate(headers):
                worksheet.write(row_num, col_num, header, header_format)
            row_num += 1

            # Projets du plan
            projets = self.search([('plan_id', '=', plan.id)])
            for projet in projets:
                worksheet.write(row_num, 0,  projet.name.name if projet.name else "", cell_format)
                worksheet.write(row_num, 1,  projet.libelle or "", cell_format)
                worksheet.write(row_num, 2,  projet.marche_initial, cell_format)
                worksheet.write(row_num, 3,  projet.ts, cell_format)
                worksheet.write(row_num, 4,  projet.ca_final, cell_format)
                worksheet.write(row_num, 5,  projet.factures_cumulees, highlight_format)
                worksheet.write(row_num, 6,  projet.od_facture, cell_format)
                worksheet.write(row_num, 7,  projet.non_facture, cell_format)
                worksheet.write(row_num, 8,  projet.trop_facture, cell_format)
                worksheet.write(row_num, 9,  projet.activite_cumulee, cell_format)
                worksheet.write(row_num, 10, projet.pourcentage_avancement * 100, lowlight_format)
                worksheet.write(row_num, 11, projet.debours_comptable_cumule, highlight_format)
                worksheet.write(row_num, 12, projet.oda_d, cell_format)
                worksheet.write(row_num, 13, projet.ffnp, cell_format)
                worksheet.write(row_num, 14, projet.stocks, cell_format)
                worksheet.write(row_num, 15, projet.provisions, cell_format)
                worksheet.write(row_num, 16, projet.total_debourses, cell_format)
                worksheet.write(row_num, 17, projet.depenses_cumulees, cell_format)
                worksheet.write(row_num, 18, projet.debours_previsionnels, cell_format)
                worksheet.write(row_num, 19, projet.resultat_chantier_cumule, cell_format)
                row_num += 1

            # Totaux
            total_marche_initial = sum(p.marche_initial for p in projets)
            total_ts = sum(p.ts for p in projets)
            total_ca_final = sum(p.ca_final for p in projets)
            total_fact_cumul = sum(p.factures_cumulees for p in projets)
            total_od_facture = sum(p.od_facture for p in projets)
            total_non_facture = sum(p.non_facture for p in projets)
            total_trop_facture = sum(p.trop_facture for p in projets)
            total_activite_cumulee = sum(p.activite_cumulee for p in projets)
            total_debours_comptable_cumule = sum(p.debours_comptable_cumule for p in projets)
            total_oda_d = sum(p.oda_d for p in projets)
            total_ffnp = sum(p.ffnp for p in projets)
            total_stocks = sum(p.stocks for p in projets)
            total_provisions = sum(p.provisions for p in projets)
            total_total_debourses = sum(p.total_debourses for p in projets)
            total_depenses_cumulees = sum(p.depenses_cumulees for p in projets)
            total_debours_previsionnels = sum(p.debours_previsionnels for p in projets)
            total_resultat_chantier_cumule = sum(p.resultat_chantier_cumule for p in projets)

            if projets:
                avg_pourcentage = sum(p.pourcentage_avancement * 100 for p in projets) / len(projets)
            else:
                avg_pourcentage = 0

            worksheet.merge_range(row_num, 0, row_num, 1, f"RESULTAT OGOOUE {plan.name}", total_format)
            worksheet.write(row_num, 2,  total_marche_initial, total_format)
            worksheet.write(row_num, 3,  total_ts, total_format)
            worksheet.write(row_num, 4,  total_ca_final, total_format)
            worksheet.write(row_num, 5,  total_fact_cumul, total_format)
            worksheet.write(row_num, 6,  total_od_facture, total_format)
            worksheet.write(row_num, 7,  total_non_facture, total_format)
            worksheet.write(row_num, 8,  total_trop_facture, total_format)
            worksheet.write(row_num, 9,  total_activite_cumulee, total_format)
            worksheet.write(row_num, 10, avg_pourcentage, total_format)
            worksheet.write(row_num, 11, total_debours_comptable_cumule, total_format)
            worksheet.write(row_num, 12, total_oda_d, total_format)
            worksheet.write(row_num, 13, total_ffnp, total_format)
            worksheet.write(row_num, 14, total_stocks, total_format)
            worksheet.write(row_num, 15, total_provisions, total_format)
            worksheet.write(row_num, 16, total_total_debourses, total_format)
            worksheet.write(row_num, 17, total_depenses_cumulees, total_format)
            worksheet.write(row_num, 18, total_debours_previsionnels, total_format)
            worksheet.write(row_num, 19, total_resultat_chantier_cumule, total_format)

            plan_objective = 0
            plan_obj = self.env['dashboard.plan'].sudo().search([('name', '=', str(plan.id))], limit=1)
            if plan_obj:
                plan_objective = plan_obj.plan

            if plan_objective:
                pourcentage_activite_plan = (total_activite_cumulee / plan_objective) * 100
            else:
                pourcentage_activite_plan = 0

            row_num += 2
            col_offset = 4
            worksheet.write(row_num, col_offset,     "Activité Cumulée", cell_format)
            worksheet.write(row_num, col_offset + 1, total_activite_cumulee, cell_format)
            worksheet.write(row_num, col_offset + 2, "", cell_format)
            row_num += 1

            worksheet.write(row_num, col_offset,     "PLAN", red_format)
            worksheet.write(row_num, col_offset + 1, plan_objective, red_format)
            worksheet.write(row_num, col_offset + 2, f"{round(pourcentage_activite_plan,2)}%", red_format)
            row_num += 3

        workbook.close()
        output.seek(0)
        return output.getvalue()
